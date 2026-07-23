import { google } from 'googleapis';
import { Readable } from 'stream';

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

async function getOrCreateFolder(name: string, parentId?: string): Promise<string> {
  const drive = getDriveClient();
  const safeName = name.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  const q = [
    `name = '${safeName}'`,
    `mimeType = 'application/vnd.google-apps.folder'`,
    `trashed = false`,
    parentId ? `'${parentId}' in parents` : '',
  ]
    .filter(Boolean)
    .join(' and ');

  const res = await drive.files.list({ q, fields: 'files(id)', pageSize: 1 });
  if (res.data.files?.length) return res.data.files[0].id!;

  const created = await drive.files.create({
    requestBody: {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: parentId ? [parentId] : [],
    },
    fields: 'id',
  });
  return created.data.id!;
}

/** Returns current Thai academic year (พ.ศ.) e.g. 2568 */
function currentThaiYear(): number {
  return new Date().getFullYear() + 543;
}

/** Get or create the year folder under root: "ปีการศึกษา 2568" */
export async function ensureYearFolder(year?: number): Promise<string> {
  const root = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID;
  const y = year ?? currentThaiYear();
  return getOrCreateFolder(`ปีการศึกษา ${y}`, root);
}

export async function ensureClassFolders(classId: string, yearFolderId?: string): Promise<{
  assignmentsId: string;
  submissionsId: string;
}> {
  const parent = yearFolderId ?? await ensureYearFolder();
  const classFolder = await getOrCreateFolder(classId, parent);
  const assignmentsId = await getOrCreateFolder('Assignments', classFolder);
  const submissionsId = await getOrCreateFolder('Submissions', classFolder);
  return { assignmentsId, submissionsId };
}

export async function ensureStudentFolder(classId: string, studentName: string): Promise<string> {
  const { submissionsId } = await ensureClassFolders(classId);
  return getOrCreateFolder(studentName, submissionsId);
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
): Promise<string> {
  const auth = getOAuth2Client();
  const { token } = await auth.getAccessToken();
  if (!token) throw new Error('Could not obtain Drive access token');

  const res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': mimeType,
        'X-Upload-Content-Length': String(size),
      },
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
export async function ensureMediaFolder(subfolder: 'Icons' | 'PDFs'): Promise<string> {
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
