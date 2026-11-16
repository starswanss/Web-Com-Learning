import { google } from 'googleapis';
import { Readable } from 'stream';
import { getActiveTerm } from '@/lib/current-term';

function getOAuth2Client() {
  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_DRIVE_CLIENT_ID,
    process.env.GOOGLE_DRIVE_CLIENT_SECRET
  );
  auth.setCredentials({ refresh_token: process.env.GOOGLE_DRIVE_REFRESH_TOKEN });
  return auth;
}

function getDriveClient() {
  return google.drive({ version: 'v3', auth: getOAuth2Client() });
}

const FOLDER_MIME = 'application/vnd.google-apps.folder';
const q = (s: string) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

// Folder ids resolved recently, plus lookups still in flight. Concurrent
// uploads (a whole class submitting at once) share one lookup instead of each
// creating its own copy of the folder. Single server process, so an in-memory
// map is enough. Entries expire so a folder deleted in Drive is re-created.
const FOLDER_TTL_MS = 10 * 60_000;
const folderCache = new Map<string, { id: Promise<string>; at: number }>();

function cachedFolder(key: string, resolve: () => Promise<string>): Promise<string> {
  const hit = folderCache.get(key);
  if (hit && Date.now() - hit.at < FOLDER_TTL_MS) return hit.id;
  const id = resolve();
  folderCache.set(key, { id, at: Date.now() });
  id.catch(() => folderCache.delete(key)); // don't cache failures
  return id;
}

async function findFolders(where: string[], parentId: string | undefined) {
  const drive = getDriveClient();
  const res = await drive.files.list({
    q: [...where, `mimeType = '${FOLDER_MIME}'`, 'trashed = false', parentId ? `'${parentId}' in parents` : '']
      .filter(Boolean)
      .join(' and '),
    // Oldest first, so when duplicates already exist every upload picks the same one.
    orderBy: 'createdTime',
    fields: 'files(id,name,appProperties)',
    pageSize: 50,
  });
  return res.data.files ?? [];
}

async function createFolder(name: string, parentId: string | undefined, appProperties?: Record<string, string>) {
  const created = await getDriveClient().files.create({
    requestBody: { name, mimeType: FOLDER_MIME, parents: parentId ? [parentId] : [], appProperties },
    fields: 'id',
  });
  return created.data.id!;
}

function getOrCreateFolder(name: string, parentId?: string): Promise<string> {
  return cachedFolder(`${parentId ?? ''}|name|${name}`, async () => {
    const [found] = await findFolders([`name = '${q(name)}'`], parentId);
    return found?.id ?? createFolder(name, parentId);
  });
}

/**
 * Academic year (พ.ศ.) the teacher set as active on the Admin page. Not the
 * calendar year: เทอม 2 runs into January–March, which is already the next
 * calendar year.
 */
async function activeAcademicYear(): Promise<number> {
  return (await getActiveTerm()).academicYear;
}

/** Get or create the year folder under root: "ปีการศึกษา 2568" (default: the active year). */
export async function ensureYearFolder(year?: number): Promise<string> {
  const root = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID;
  const y = year ?? await activeAcademicYear();
  return getOrCreateFolder(`ปีการศึกษา ${y}`, root);
}

export async function ensureClassFolders(classId: string, yearFolderId?: string): Promise<{
  assignmentsId: string;
  submissionsId: string;
}> {
  const parent = yearFolderId ?? await ensureYearFolder();
  const classFolder = await getOrCreateFolder(classId, parent);
  const [assignmentsId, submissionsId] = await Promise.all([
    getOrCreateFolder('Assignments', classFolder),
    getOrCreateFolder('Submissions', classFolder),
  ]);
  return { assignmentsId, submissionsId };
}

/**
 * One folder per student, identified by their uid (stored on the folder as the
 * Drive appProperty `studentId`), not by name, so a renamed student keeps the
 * same folder and two students with the same name never share one. The folder
 * is still named after the student so teachers can browse it.
 */
export async function ensureStudentFolder(classId: string, studentId: string, studentName: string): Promise<string> {
  const { submissionsId } = await ensureClassFolders(classId);
  const name = (studentName || '').trim() || studentId;
  return cachedFolder(`${submissionsId}|student|${studentId}`, async () => {
    const drive = getDriveClient();

    // 1. Already tagged with this student → use it (renamed to the current name).
    const [mine] = await findFolders(
      [`appProperties has { key='studentId' and value='${q(studentId)}' }`],
      submissionsId,
    );
    if (mine) {
      if (mine.name !== name) {
        await drive.files.update({ fileId: mine.id!, requestBody: { name } }).catch(() => {});
      }
      return mine.id!;
    }

    // 2. A folder from before tagging, named after this student and not claimed
    //    by anyone else → adopt it so earlier files stay together.
    const sameName = await findFolders([`name = '${q(name)}'`], submissionsId);
    const legacy = sameName.find((f) => !f.appProperties?.studentId);
    if (legacy) {
      await drive.files.update({
        fileId: legacy.id!,
        requestBody: { appProperties: { studentId } },
      });
      return legacy.id!;
    }

    // 3. New folder. If another student already has this name, add a short id
    //    so the two folders can be told apart.
    const folderName = sameName.length ? `${name} (${studentId.slice(0, 6)})` : name;
    return createFolder(folderName, submissionsId, { studentId });
  });
}

export async function uploadFileToDrive(
  folderId: string,
  buffer: Buffer,
  mimeType: string,
  filename: string
): Promise<{ fileId: string; webViewLink: string }> {
  const drive = getDriveClient();
  const stream = Readable.from(buffer);

  const res = await drive.files.create({
    requestBody: { name: filename, parents: [folderId] },
    media: { mimeType, body: stream },
    fields: 'id, webViewLink',
  });

  await drive.permissions.create({
    fileId: res.data.id!,
    requestBody: { role: 'reader', type: 'anyone' },
  });

  return { fileId: res.data.id!, webViewLink: res.data.webViewLink! };
}

export async function uploadAssignmentFile(
  classId: string,
  buffer: Buffer,
  mimeType: string,
  filename: string
): Promise<{ fileId: string; webViewLink: string }> {
  const { assignmentsId } = await ensureClassFolders(classId);
  return uploadFileToDrive(assignmentsId, buffer, mimeType, filename);
}

/**
 * Start a Google Drive **resumable** upload and return the session URL.
 *
 * The browser then PUTs the file bytes straight to that URL, so the payload
 * never passes through our serverless function — this is what allows uploads
 * larger than the hosting platform's ~4.5 MB request-body limit. The session
 * URL is pre-authorised, so no access token is exposed to the client.
 */
export async function createResumableUploadSession(
  folderId: string,
  filename: string,
  mimeType: string,
  size: number,
  clientOrigin?: string,
): Promise<string> {
  const auth = getOAuth2Client();
  const { token } = await auth.getAccessToken();
  if (!token) throw new Error('Could not obtain Drive access token');

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json; charset=UTF-8',
    'X-Upload-Content-Type': mimeType,
    'X-Upload-Content-Length': String(size),
  };
  // Binds the session to the browser's origin so Google returns CORS headers on
  // the client's PUT. Without it the direct upload is blocked by CORS.
  if (clientOrigin) headers.Origin = clientOrigin;

  const res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id',
    {
      method: 'POST',
      headers,
      body: JSON.stringify({ name: filename, parents: [folderId] }),
    },
  );

  if (!res.ok) {
    throw new Error(`Drive resumable session failed (${res.status}): ${await res.text()}`);
  }
  const location = res.headers.get('location');
  if (!location) throw new Error('Drive did not return an upload session URL');
  return location;
}

/** Make an uploaded file publicly readable (called after a direct upload). */
export async function makeFilePublic(fileId: string): Promise<void> {
  const drive = getDriveClient();
  await drive.permissions.create({
    fileId,
    requestBody: { role: 'reader', type: 'anyone' },
  });
}

/** Get or create Root > LMS Media > {subfolder} */
export async function ensureMediaFolder(subfolder: 'Icons' | 'PDFs' | 'Images'): Promise<string> {
  const root = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID!;
  const mediaFolder = await getOrCreateFolder('LMS Media', root);
  return getOrCreateFolder(subfolder, mediaFolder);
}

/** Download a Drive file and return its raw content + mimeType */
export async function downloadFileFromDrive(fileId: string): Promise<{ data: Buffer; mimeType: string }> {
  const drive = getDriveClient();

  const meta = await drive.files.get({ fileId, fields: 'mimeType' });

  // responseType: 'stream' is the typed overload; collect chunks into a Buffer
  const response = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'stream' });
  const stream = response.data as unknown as import('stream').Readable;

  const chunks: Buffer[] = [];
  await new Promise<void>((resolve, reject) => {
    stream.on('data', (chunk: Buffer) => chunks.push(chunk));
    stream.on('end', resolve);
    stream.on('error', reject);
  });

  return {
    data: Buffer.concat(chunks),
    mimeType: (meta.data.mimeType as string) ?? 'image/jpeg',
  };
}
