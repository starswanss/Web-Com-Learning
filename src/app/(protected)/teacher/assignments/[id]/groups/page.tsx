'use client';

import { use, useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import Link from 'next/link';

interface Member { uid: string; displayName: string; photoURL?: string }
interface Group { id: string; name: string; memberIds: string[]; classId: string; members: Member[] }
interface Student { uid: string; displayName: string; classId: string }

// Colour palette for class badges
const CLASS_COLORS = [
  'border-blue-800/50 bg-blue-950/40 text-blue-300',
  'border-violet-800/50 bg-violet-950/40 text-violet-300',
  'border-emerald-800/50 bg-emerald-950/40 text-emerald-300',
  'border-amber-800/50 bg-amber-950/40 text-amber-300',
  'border-rose-800/50 bg-rose-950/40 text-rose-300',
  'border-cyan-800/50 bg-cyan-950/40 text-cyan-300',
];

export default function GroupsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: assignmentId } = use(params);
  const { profile, loading } = useAuth();
  const router = useRouter();

  const [groups, setGroups] = useState<Group[]>([]);
  const [allStudents, setAllStudents] = useState<Student[]>([]);
  const [assignmentTitle, setAssignmentTitle] = useState('');
  const [assignmentClassIds, setAssignmentClassIds] = useState<string[]>([]);
  const [fetching, setFetching] = useState(true);

  // Randomize dialog
  const [showRandomize, setShowRandomize] = useState(false);
  const [groupCount, setGroupCount] = useState(5);
  const [randomizing, setRandomizing] = useState(false);

  // Add group dialog
  const [showAdd, setShowAdd] = useState(false);
  const [addClassId, setAddClassId] = useState('');
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupMembers, setNewGroupMembers] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);

  // Copy-from-previous dialog
  const [showCopy, setShowCopy] = useState(false);
  const [copySources, setCopySources] = useState<Array<{ assignmentId: string; title: string; classIds: string[]; groupCount: number }>>([]);
  const [copyLoading, setCopyLoading] = useState(false);
  const [copyClear, setCopyClear] = useState(true);
  const [copyingId, setCopyingId] = useState<string | null>(null);

  // Edit state
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editMembers, setEditMembers] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const [msg, setMsg] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && profile?.role !== 'teacher') router.push('/dashboard');
  }, [loading, profile, router]);

  const load = useCallback(async () => {
    setFetching(true);
    const [groupsRes, assignRes, studentsRes] = await Promise.all([
      fetch(`/api/teacher/groups?assignmentId=${assignmentId}`).then(r => r.json()),
      fetch(`/api/assignments/${assignmentId}`).then(r => r.json()),
      fetch('/api/teacher/members').then(r => r.json()),
    ]);
    setGroups(Array.isArray(groupsRes) ? groupsRes : []);
    setAssignmentTitle(assignRes?.title ?? '');
    const cids: string[] = Array.isArray(assignRes?.classIds) ? assignRes.classIds : [];
    setAssignmentClassIds(cids);
    setAddClassId(cids[0] ?? '');
    // Filter students to only those in the assignment's classes
    const studentList: Student[] = Array.isArray(studentsRes) ? studentsRes : [];
    setAllStudents(studentList.filter(s => cids.includes(s.classId)));
    setFetching(false);
  }, [assignmentId]);

  useEffect(() => { if (profile?.role === 'teacher') load(); }, [profile, load]);

  // Map classId → colour index
  const classColorMap = new Map(assignmentClassIds.map((c, i) => [c, i % CLASS_COLORS.length]));
  function classBadge(classId: string) {
    const idx = classColorMap.get(classId) ?? 0;
    return CLASS_COLORS[idx];
  }

  const assignedUids = new Set(groups.flatMap(g => g.memberIds));

  // Students shown in add dialog — filtered to chosen class
  const addDialogStudents = allStudents.filter(s => s.classId === addClassId);

  // Students shown in edit dialog — filtered to the group's class
  const editGroup = groups.find(g => g.id === editId);
  const editDialogStudents = editGroup
    ? allStudents.filter(s => s.classId === editGroup.classId)
    : allStudents;

  async function handleRandomize() {
    setRandomizing(true); setMsg(null);
    const res = await fetch('/api/teacher/groups/randomize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assignmentId, groupCount, clearExisting: true }),
    });
    const data = await res.json();
    if (res.ok) {
      setMsg(`สุ่มสำเร็จ ${data.groups.length} กลุ่ม`);
      setShowRandomize(false);
      await load();
    } else {
      setMsg(data.error ?? 'ไม่สำเร็จ');
    }
    setRandomizing(false);
  }

  async function openCopy() {
    setShowCopy(true); setCopyLoading(true); setMsg(null);
    try {
      const res = await fetch(`/api/teacher/groups/copy?assignmentId=${assignmentId}`);
      const data = await res.json();
      setCopySources(Array.isArray(data) ? data : []);
    } catch { setCopySources([]); }
    finally { setCopyLoading(false); }
  }

  async function handleCopy(sourceAssignmentId: string) {
    setCopyingId(sourceAssignmentId); setMsg(null);
    const res = await fetch('/api/teacher/groups/copy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assignmentId, sourceAssignmentId, clearExisting: copyClear }),
    });
    const data = await res.json();
    if (res.ok) {
      setMsg(`คัดลอกกลุ่มสำเร็จ ${data.copied} กลุ่ม${data.skipped ? ` · ข้าม ${data.skipped} (ห้องไม่ตรง)` : ''}`);
      setShowCopy(false);
      await load();
    } else {
      setMsg(data.error ?? 'ไม่สำเร็จ');
    }
    setCopyingId(null);
  }

  async function handleAddGroup() {
    if (!newGroupName.trim()) return;
    setAdding(true);
    const res = await fetch('/api/teacher/groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        assignmentId,
        name: newGroupName,
        memberIds: newGroupMembers,
        classId: addClassId,
      }),
    });
    if (res.ok) {
      setShowAdd(false);
      setNewGroupName('');
      setNewGroupMembers([]);
      await load();
    }
    setAdding(false);
  }

  async function handleSaveEdit(groupId: string) {
    setSaving(true);
    await fetch(`/api/teacher/groups/${groupId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editName, memberIds: editMembers }),
    });
    setEditId(null); setSaving(false); await load();
  }

  async function handleDelete(groupId: string) {
    if (!confirm('ลบกลุ่มนี้?')) return;
    setDeleting(groupId);
    await fetch(`/api/teacher/groups/${groupId}`, { method: 'DELETE' });
    setDeleting(null); await load();
  }

  function startEdit(g: Group) {
    setEditId(g.id); setEditName(g.name); setEditMembers([...g.memberIds]);
  }

  function toggleMember(uid: string, current: string[], set: (v: string[]) => void) {
    set(current.includes(uid) ? current.filter(x => x !== uid) : [...current, uid]);
  }

  // Group cards by class for display
  const groupsByClass = assignmentClassIds.map(cid => ({
    classId: cid,
    items: groups.filter(g => g.classId === cid),
  }));
  // Groups with unknown/missing classId go at the end
  const ungrouped = groups.filter(g => !assignmentClassIds.includes(g.classId));

  if (loading || !profile) return <Spinner />;

  return (
    <div className="min-h-screen bg-slate-950">
      <header className="border-b border-slate-800 bg-slate-900 px-6 py-4">
        <div className="mx-auto flex max-w-5xl items-center gap-3 flex-wrap">
          <Link href={`/teacher/assignments/${assignmentId}/submissions`} className="text-sm text-slate-400 hover:text-slate-200">
            ← กลับ
          </Link>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-semibold text-slate-100 truncate">จัดกลุ่ม — {assignmentTitle}</h1>
            <p className="text-xs text-slate-500">{groups.length} กลุ่ม · {assignedUids.size} นักเรียนในกลุ่ม · {assignmentClassIds.length} ห้อง</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap shrink-0">
            {msg && <span className="text-xs text-emerald-400">{msg}</span>}
            <Link
              href={`/teacher/assignments/${assignmentId}/group-submissions`}
              className="rounded-lg border border-blue-700 bg-blue-950/40 px-3 py-1.5 text-xs text-blue-300 hover:border-blue-500 transition-all"
            >
              📋 ดูงานกลุ่ม
            </Link>
            <button
              onClick={openCopy}
              className="rounded-lg border border-cyan-700 bg-cyan-950/40 px-3 py-1.5 text-xs text-cyan-300 hover:border-cyan-500 transition-all"
            >
              📋 ใช้กลุ่มเดิม
            </button>
            <button
              onClick={() => { setShowRandomize(true); setMsg(null); }}
              className="rounded-lg border border-purple-700 bg-purple-950/40 px-3 py-1.5 text-xs text-purple-300 hover:border-purple-500 transition-all"
            >
              🎲 สุ่มกลุ่ม
            </button>
            <button
              onClick={() => {
                setShowAdd(true);
                setNewGroupName(`กลุ่ม ${groups.length + 1}`);
                setNewGroupMembers([]);
                setAddClassId(assignmentClassIds[0] ?? '');
              }}
              className="rounded-lg border border-emerald-700 bg-emerald-950/40 px-3 py-1.5 text-xs text-emerald-300 hover:border-emerald-500 transition-all"
            >
              + เพิ่มกลุ่ม
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6 space-y-8">
        {fetching ? (
          <div className="flex justify-center py-20">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-700 border-t-slate-300" />
          </div>
        ) : groups.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-700 py-16 text-center">
            <p className="text-3xl mb-3">👥</p>
            <p className="text-slate-400 font-medium">ยังไม่มีกลุ่ม</p>
            <p className="text-slate-600 text-sm mt-1">กด "สุ่มกลุ่ม" หรือ "เพิ่มกลุ่ม" เพื่อเริ่มต้น</p>
          </div>
        ) : (
          <>
            {groupsByClass.map(({ classId, items }) => items.length === 0 ? null : (
              <section key={classId}>
                <div className="mb-3 flex items-center gap-2">
                  <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${classBadge(classId)}`}>
                    {classId}
                  </span>
                  <span className="text-xs text-slate-500">{items.length} กลุ่ม · {items.reduce((s, g) => s + g.memberIds.length, 0)} นักเรียน</span>
                </div>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {items.map((g) => <GroupCard key={g.id} group={g} classBadge={classBadge} editId={editId} editName={editName} editMembers={editMembers} editDialogStudents={editDialogStudents} saving={saving} deleting={deleting} onEdit={startEdit} onSave={handleSaveEdit} onDelete={handleDelete} onCancelEdit={() => setEditId(null)} onEditName={setEditName} onToggleMember={(uid) => toggleMember(uid, editMembers, setEditMembers)} />)}
                </div>
              </section>
            ))}
            {ungrouped.length > 0 && (
              <section>
                <div className="mb-3 flex items-center gap-2">
                  <span className="rounded-full border border-slate-700 bg-slate-800 px-3 py-1 text-xs text-slate-400">อื่นๆ</span>
                </div>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {ungrouped.map((g) => <GroupCard key={g.id} group={g} classBadge={classBadge} editId={editId} editName={editName} editMembers={editMembers} editDialogStudents={editDialogStudents} saving={saving} deleting={deleting} onEdit={startEdit} onSave={handleSaveEdit} onDelete={handleDelete} onCancelEdit={() => setEditId(null)} onEditName={setEditName} onToggleMember={(uid) => toggleMember(uid, editMembers, setEditMembers)} />)}
                </div>
              </section>
            )}
          </>
        )}
      </main>

      {/* Copy-from-previous Dialog */}
      {showCopy && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowCopy(false)} />
          <div className="relative z-10 w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
            <h2 className="text-base font-semibold text-slate-100 mb-1">📋 ใช้กลุ่มเดิมจากใบงานอื่น</h2>
            <p className="text-xs text-slate-500 mb-4">
              คัดลอกกลุ่ม (ชื่อ + สมาชิก) จากใบงานที่เคยจัดกลุ่มไว้ — เฉพาะกลุ่มที่ห้องตรงกับใบงานนี้
            </p>

            <label className="mb-3 flex items-center gap-2 text-xs text-slate-400">
              <input type="checkbox" checked={copyClear} onChange={e => setCopyClear(e.target.checked)} className="accent-cyan-500" />
              ลบกลุ่มเดิมในใบงานนี้ก่อนคัดลอก
            </label>

            {copyLoading ? (
              <div className="flex justify-center py-8">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-700 border-t-slate-300" />
              </div>
            ) : copySources.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-500">ยังไม่มีใบงานอื่นที่จัดกลุ่มไว้</p>
            ) : (
              <div className="max-h-72 space-y-2 overflow-y-auto">
                {copySources.map((s) => (
                  <button
                    key={s.assignmentId}
                    onClick={() => handleCopy(s.assignmentId)}
                    disabled={copyingId !== null}
                    className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-700 bg-slate-800/60 px-4 py-3 text-left transition-all hover:border-cyan-600 hover:bg-slate-800 disabled:opacity-50"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-200">{s.title}</p>
                      <p className="text-[11px] text-slate-500">
                        {s.groupCount} กลุ่ม · ห้อง {s.classIds.join(', ') || '—'}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs font-semibold text-cyan-400">
                      {copyingId === s.assignmentId ? 'กำลังคัดลอก…' : 'ใช้กลุ่มนี้ →'}
                    </span>
                  </button>
                ))}
              </div>
            )}

            <button onClick={() => setShowCopy(false)} className="mt-4 w-full rounded-xl border border-slate-700 py-2.5 text-sm text-slate-400 hover:text-slate-200">
              ปิด
            </button>
          </div>
        </div>
      )}

      {/* Randomize Dialog */}
      {showRandomize && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowRandomize(false)} />
          <div className="relative z-10 w-full max-w-sm rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
            <h2 className="text-base font-semibold text-slate-100 mb-1">🎲 สุ่มแบ่งกลุ่ม</h2>
            <p className="text-xs text-slate-500 mb-4">
              สุ่มแยกตามห้อง — นักเรียนจากต่างห้องจะไม่ถูกปนกัน
              {assignmentClassIds.length > 1 && (
                <> · {assignmentClassIds.length} ห้อง รวม <strong className="text-purple-400">{groupCount * assignmentClassIds.length} กลุ่ม</strong></>
              )}
            </p>

            {/* Class preview chips */}
            <div className="flex flex-wrap gap-1.5 mb-4">
              {assignmentClassIds.map(c => (
                <span key={c} className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${classBadge(c)}`}>{c}</span>
              ))}
            </div>

            <label className="block text-xs text-slate-400 mb-1">จำนวนกลุ่ม{assignmentClassIds.length > 1 ? '/ห้อง' : ''}</label>
            <input
              type="number" min={1} max={30} value={groupCount}
              onChange={e => setGroupCount(Math.max(1, Number(e.target.value)))}
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-purple-600 mb-1"
            />
            {assignmentClassIds.length > 1 && (
              <p className="text-[11px] text-slate-600 mb-4">
                จะสร้างทั้งหมด {groupCount * assignmentClassIds.length} กลุ่ม ({groupCount} กลุ่ม × {assignmentClassIds.length} ห้อง)
              </p>
            )}
            <p className="text-[11px] text-amber-600 mb-4">⚠ กลุ่มเดิมทั้งหมดจะถูกลบ</p>
            <div className="flex gap-2">
              <button onClick={handleRandomize} disabled={randomizing} className="flex-1 rounded-xl bg-purple-600 py-2.5 text-sm font-medium text-white hover:bg-purple-500 disabled:opacity-50">
                {randomizing ? 'กำลังสุ่ม…' : 'สุ่มกลุ่ม'}
              </button>
              <button onClick={() => setShowRandomize(false)} className="rounded-xl border border-slate-700 px-4 py-2.5 text-sm text-slate-400 hover:text-slate-200">
                ยกเลิก
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Group Dialog */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowAdd(false)} />
          <div className="relative z-10 w-full max-w-sm rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
            <h2 className="text-base font-semibold text-slate-100 mb-4">+ เพิ่มกลุ่ม</h2>

            {/* Class selector — only shown when assignment has multiple classes */}
            {assignmentClassIds.length > 1 && (
              <div className="mb-3">
                <label className="block text-xs text-slate-400 mb-1">ห้องเรียน</label>
                <div className="flex flex-wrap gap-1.5">
                  {assignmentClassIds.map(c => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => { setAddClassId(c); setNewGroupMembers([]); }}
                      className={`rounded-full border px-3 py-1 text-xs font-semibold transition-all ${
                        addClassId === c
                          ? classBadge(c)
                          : 'border-slate-700 bg-slate-800 text-slate-500 hover:text-slate-300'
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {assignmentClassIds.length === 1 && (
              <div className="mb-3 flex items-center gap-2">
                <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${classBadge(addClassId)}`}>{addClassId}</span>
              </div>
            )}

            <label className="block text-xs text-slate-400 mb-1">ชื่อกลุ่ม</label>
            <input
              value={newGroupName}
              onChange={e => setNewGroupName(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-emerald-600 mb-3"
            />

            <label className="block text-xs text-slate-400 mb-1">
              สมาชิก — {newGroupMembers.length} คนที่เลือก
              {addDialogStudents.length === 0 && addClassId && (
                <span className="ml-2 text-amber-500">ไม่มีนักเรียนในห้องนี้</span>
              )}
            </label>
            <div className="max-h-52 overflow-y-auto space-y-1 rounded-lg border border-slate-700 bg-slate-800/60 p-2 mb-4">
              {addDialogStudents.length === 0 ? (
                <p className="px-2 py-3 text-xs text-slate-600 text-center italic">ไม่มีนักเรียน</p>
              ) : addDialogStudents.map(s => (
                <label
                  key={s.uid}
                  className={`flex items-center gap-2 cursor-pointer rounded-lg px-2 py-1 hover:bg-slate-700/40 ${
                    assignedUids.has(s.uid) && !newGroupMembers.includes(s.uid) ? 'opacity-40' : ''
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={newGroupMembers.includes(s.uid)}
                    onChange={() => toggleMember(s.uid, newGroupMembers, setNewGroupMembers)}
                    className="accent-emerald-500"
                  />
                  <span className="text-xs text-slate-300">{s.displayName}</span>
                  {assignedUids.has(s.uid) && !newGroupMembers.includes(s.uid) && (
                    <span className="text-[10px] text-slate-600">(อยู่กลุ่มแล้ว)</span>
                  )}
                </label>
              ))}
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleAddGroup}
                disabled={adding || !newGroupName.trim()}
                className="flex-1 rounded-xl bg-emerald-600 py-2.5 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
              >
                {adding ? 'กำลังสร้าง…' : 'สร้างกลุ่ม'}
              </button>
              <button onClick={() => setShowAdd(false)} className="rounded-xl border border-slate-700 px-4 py-2.5 text-sm text-slate-400 hover:text-slate-200">
                ยกเลิก
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Group Card ─────────────────────────────────────────────────────────────────

function GroupCard({
  group: g,
  classBadge,
  editId,
  editName,
  editMembers,
  editDialogStudents,
  saving,
  deleting,
  onEdit,
  onSave,
  onDelete,
  onCancelEdit,
  onEditName,
  onToggleMember,
}: {
  group: Group;
  classBadge: (classId: string) => string;
  editId: string | null;
  editName: string;
  editMembers: string[];
  editDialogStudents: { uid: string; displayName: string; classId: string }[];
  saving: boolean;
  deleting: string | null;
  onEdit: (g: Group) => void;
  onSave: (id: string) => void;
  onDelete: (id: string) => void;
  onCancelEdit: () => void;
  onEditName: (v: string) => void;
  onToggleMember: (uid: string) => void;
}) {
  const isEditing = editId === g.id;

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 overflow-hidden">
      {isEditing ? (
        <div className="p-4 space-y-3">
          <input
            value={editName}
            onChange={e => onEditName(e.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-blue-600"
          />
          <p className="text-[11px] text-slate-500">
            ห้อง <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${classBadge(g.classId)}`}>{g.classId}</span>
            {' '}— แสดงเฉพาะนักเรียนในห้องนี้
          </p>
          <div className="max-h-48 overflow-y-auto space-y-1 rounded-lg border border-slate-700 bg-slate-800/60 p-2">
            {editDialogStudents.length === 0 ? (
              <p className="px-2 py-2 text-xs text-slate-600 italic text-center">ไม่มีนักเรียน</p>
            ) : editDialogStudents.map(s => (
              <label key={s.uid} className="flex items-center gap-2 cursor-pointer rounded-lg px-2 py-1 hover:bg-slate-700/40">
                <input
                  type="checkbox"
                  checked={editMembers.includes(s.uid)}
                  onChange={() => onToggleMember(s.uid)}
                  className="accent-blue-500"
                />
                <span className="text-xs text-slate-300">{s.displayName}</span>
              </label>
            ))}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => onSave(g.id)}
              disabled={saving}
              className="flex-1 rounded-lg bg-blue-600 py-1.5 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-50"
            >
              {saving ? '…' : 'บันทึก'}
            </button>
            <button
              onClick={onCancelEdit}
              className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200"
            >
              ยกเลิก
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between border-b border-slate-800 bg-slate-800/40 px-4 py-3">
            <div className="flex items-center gap-2 min-w-0">
              <h3 className="font-semibold text-slate-100 text-sm truncate">{g.name}</h3>
            </div>
            <div className="flex items-center gap-1.5 shrink-0 ml-2">
              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${classBadge(g.classId)}`}>{g.classId}</span>
              <span className="rounded-full bg-slate-700 px-2 py-0.5 text-[10px] text-slate-400">{g.memberIds.length} คน</span>
            </div>
          </div>
          <div className="divide-y divide-slate-800/60">
            {g.members.length === 0 ? (
              <p className="px-4 py-3 text-xs text-slate-600 italic">ยังไม่มีสมาชิก</p>
            ) : g.members.map(m => (
              <div key={m.uid} className="flex items-center gap-2.5 px-4 py-2.5">
                <div className="h-6 w-6 shrink-0 rounded-full bg-slate-700 flex items-center justify-center text-[10px] font-bold text-slate-300">
                  {m.displayName[0]}
                </div>
                <span className="text-xs text-slate-300 truncate">{m.displayName}</span>
              </div>
            ))}
          </div>
          <div className="flex border-t border-slate-800 divide-x divide-slate-800">
            <button
              onClick={() => onEdit(g)}
              className="flex-1 py-2 text-xs text-blue-400 hover:bg-blue-950/20 transition-colors"
            >
              ✏️ แก้ไข
            </button>
            <button
              onClick={() => onDelete(g.id)}
              disabled={deleting === g.id}
              className="flex-1 py-2 text-xs text-red-500 hover:bg-red-950/20 transition-colors disabled:opacity-50"
            >
              {deleting === g.id ? '…' : '🗑 ลบ'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function Spinner() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-700 border-t-slate-300" />
    </div>
  );
}
