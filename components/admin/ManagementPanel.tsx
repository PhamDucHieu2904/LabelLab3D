'use client';

import { useEffect, useRef, useState } from 'react';
import { Archive, ArrowDownToLine, Check, CheckCircle2, Eye, FileBox, Pencil, Plus, RotateCcw, Search, Trash2, Upload, X } from 'lucide-react';
import { createManagementData, migrateManagementData, fieldLabels, managementTabs, persistentManagementData, type ManagementRecord, type ManagementSection } from '@/lib/admin/management-data';
import { logAdminActivity } from '@/lib/admin/activity-store';
import s from './ManagementPanel.module.css';

const storageKey='labellab-admin-management-v1';
const date=()=>new Date().toLocaleDateString('vi-VN');
export default function ManagementPanel({section}:{section:ManagementSection}) {
 const [data,setData]=useState(createManagementData);
 const [ready,setReady]=useState(false);
 const [selected,setSelected]=useState('');
 const [search,setSearch]=useState('');
 const [filter,setFilter]=useState('all');
 const [page,setPage]=useState(1);
 const [notice,setNotice]=useState('');
 const [editor,setEditor]=useState<{record:ManagementRecord;mode:'edit'|'view'|'delete'}|null>(null);
 const [error,setError]=useState('');
 const [checks,setChecks]=useState<string[]|null>(null);
 const modal=useRef<HTMLDialogElement>(null);
 const upload=useRef<HTMLInputElement>(null);
 const stagedUrls=useRef<string[]>([]);
 const tabs=managementTabs[section];
 const baseTab=tabs.find(t=>t.id===selected)??tabs[0];
 const tab={...baseTab,fields:baseTab.fields.filter(field=>baseTab.id!=='displays'||field.key==='mode'||field.key==='order'||(editor?.record.values.mode==='2D'?['image','alt'].includes(field.key):!['image','alt'].includes(field.key))).map(field=>field.key==='model'?{...field,required:baseTab.id==='displays'||field.required,options:data.models.filter(r=>r.status!=='Lưu trữ').map(r=>r.name)}:field.key==='label'||baseTab.id==='displays'&&field.key==='image'?{...field,required:true}:field.key==='category'?{...field,options:data.categories.filter(r=>r.status!=='Lưu trữ').map(r=>r.name)}:field)};
 const rows=data[tab.id]??[];
 const filtered=rows.filter(r=>(filter==='all'||r.status===filter)&&`${r.name} ${Object.values(r.values).join(' ')}`.toLocaleLowerCase('vi').includes(search.toLocaleLowerCase('vi')));
 const pages=Math.max(1,Math.ceil(filtered.length/10));
 const currentPage=Math.min(page,pages);
 useEffect(()=>{
  const timer=window.setTimeout(()=>{
   try { const raw=localStorage.getItem(storageKey); if(raw){ const parsed=JSON.parse(raw); if(parsed&&typeof parsed==='object'&&Object.values(parsed).every(v=>Array.isArray(v)&&v.every(r=>typeof r.id==='string'&&typeof r.name==='string'&&r.values&&typeof r.values==='object'&&Object.values(r.values).every(value=>typeof value==='string')))){const initial=createManagementData();const restored=persistentManagementData(migrateManagementData(initial, parsed));restored.releases=restored.releases.map(record=>record.id==='release-demo'&&!record.values.snapshot?{...record,values:{...record.values,snapshot:initial.releases[0].values.snapshot}}:record);setData(restored);} }}catch{/* Retain usable initial fixtures. */}
   setReady(true);
  },0);
  return()=>window.clearTimeout(timer);
 },[]);
 useEffect(()=>{if(ready)try{localStorage.setItem(storageKey,JSON.stringify(persistentManagementData(data)));}catch{const timer=window.setTimeout(()=>setNotice('Bộ nhớ trình duyệt không khả dụng; thay đổi chỉ giữ trong phiên này.'),0);return()=>window.clearTimeout(timer);}},[data,ready]);
 useEffect(()=>{if(editor&&!modal.current?.open)modal.current?.showModal();},[editor]);
 useEffect(()=>()=>stagedUrls.current.forEach(url=>URL.revokeObjectURL(url)),[]);
 function update(next:Record<string,ManagementRecord[]>,message:string){const changed=Object.entries(next).flatMap(([key,records])=>{const before=data[key]??[];return [...records.filter(r=>JSON.stringify(r)!==JSON.stringify(before.find(old=>old.id===r.id))),...before.filter(r=>!records.some(item=>item.id===r.id))].map(r=>r.name);});logAdminActivity({actor:'Quản trị viên',action:message,target:[...new Set(changed)].slice(0,5).join(', ')||tab.name,level:message.includes('xóa')||message.includes('dùng lại')?'warning':'info'});setData(next);setNotice(message);setChecks(null);}
 function open(record:ManagementRecord,mode:'edit'|'view'|'delete'){setEditor({record:{...record,values:{...record.values}},mode});setError('');}
 function close(){modal.current?.close();setEditor(null);setError('');}
 function toggle(record:ManagementRecord){const status=record.status==='Đang bật'?'Đang tắt':'Đang bật';update({...data,[tab.id]:rows.map(r=>r.id===record.id?{...r,status,updated:date()}:r)},`Đã ${status==='Đang bật'?'bật':'tắt'} “${record.name}”.`);}
 function archive(record:ManagementRecord){const status=record.status==='Lưu trữ'?'Đang tắt':'Lưu trữ';update({...data,[tab.id]:rows.map(r=>r.id===record.id?{...r,status,updated:date()}:r)},status==='Lưu trữ'?'Đã lưu trữ.':'Đã khôi phục.');}
 function save(event:React.FormEvent<HTMLFormElement>){
  event.preventDefault();if(!editor)return;
  const record=editor.record;
  if(!record.name.trim()){setError('Nhập tên.');return;}
  for(const field of tab.fields){const value=record.values[field.key]??'';if(field.required&&!value.trim()){setError(`Nhập ${field.label.toLocaleLowerCase('vi')}.`);return;}if(field.type==='number'&&value!==''&&(!Number.isFinite(Number(value))||(field.min!==undefined&&Number(value)<field.min)||(field.max!==undefined&&Number(value)>field.max))){setError(`${field.label} không hợp lệ${field.min!==undefined?` (từ ${field.min}${field.max!==undefined?` đến ${field.max}`:''})`:''}.`);return;}}
  if(record.values.start&&record.values.end&&record.values.end<record.values.start){setError('Ngày kết thúc phải sau ngày bắt đầu.');return;}
  if(tab.id==='models'){try{const slots=JSON.parse(record.values.slots||'{}');if(!slots||Array.isArray(slots)||typeof slots!=='object'||!Object.values(slots).every(value=>Array.isArray(value)&&value.every(item=>typeof item==='string')))throw new Error();}catch{setError('Ánh xạ vật liệu phải là đối tượng JSON chứa danh sách tên mesh.');return;}}
  if(record.values.code&&rows.some(r=>r.id!==record.id&&r.values.code?.toLocaleLowerCase()===record.values.code?.trim().toLocaleLowerCase())){setError('Mã này đã tồn tại.');return;}
  if(tab.id==='displays'&&record.values.mode==='3D'&&!data.materials.some(r=>r.name===record.values.label&&r.values.model===record.values.model&&r.status!=='Lưu trữ')){setError('Nhãn phải tồn tại và tương thích với model đã chọn.');return;}
  for(const key of ['color','capColor','liquidColor'])if(record.values[key]&&!/^#[0-9a-f]{6}$/i.test(record.values[key])){setError('Màu phải có dạng #RRGGBB.');return;}
  const saved={...record,name:record.name.trim(),updated:date(),poster:record.values.poster||record.poster};
  update({...data,[tab.id]:rows.some(r=>r.id===record.id)?rows.map(r=>r.id===record.id?saved:r):[saved,...rows]},'Đã lưu bản mẫu.');close();
 }
 function newRecord(){open({id:crypto.randomUUID(),name:'',status:'Đang tắt',updated:date(),values:Object.fromEntries(tab.fields.map(f=>[f.key,f.options?.[0]??'']))},'edit');}
 function stage(files:FileList|null){
  if(!files?.length)return;
  const staged=Array.from(files).map(file=>{const poster=file.type.startsWith('image/')?URL.createObjectURL(file):undefined;if(poster)stagedUrls.current.push(poster);const ext=file.name.split('.').pop()?.toLowerCase();return {...{id:crypto.randomUUID(),name:file.name,status:'Đang tắt',updated:date(),poster},values:{type:ext==='glb'?'Model GLB':ext==='hdr'||ext==='exr'?'HDRI':file.type.startsWith('image/')?'Texture':'Template',file:file.name,size:`${(file.size/1024/1024).toFixed(2)} MB`,usage:'File cục bộ · chưa tải lên máy chủ'}};});
  update({...data,assets:[...staged,...data.assets]},`Đã thêm ${staged.length} file vào danh sách cục bộ.`);if(upload.current)upload.current.value='';
 }
 function preflight(){
  const issues:string[]=[];
  for(const key of ['models','materials','displays','banners']){
   const schema=Object.values(managementTabs).flat().find(t=>t.id===key)!;
   for(const record of data[key].filter(r=>r.status==='Đang bật')){
    const is2D=key==='displays'&&record.values.mode==='2D';
    for(const field of schema.fields){
     if(is2D&&['model','label','offset','capColor','liquidColor'].includes(field.key))continue;
     const value=record.values[field.key]??'';
     if(field.required&&!value.trim())issues.push(`${record.name}: thiếu ${field.label.toLocaleLowerCase('vi')}`);
     if(field.type==='number'&&value!==''&&(!Number.isFinite(Number(value))||(field.min!==undefined&&Number(value)<field.min)||(field.max!==undefined&&Number(value)>field.max)))issues.push(`${record.name}: ${field.label.toLocaleLowerCase('vi')} không hợp lệ`);
    }
    if((key==='materials'||key==='displays'&&!is2D)&&!data.models.some(r=>r.name===record.values.model&&r.status==='Đang bật'))issues.push(`${record.name}: model đang tắt hoặc không tồn tại`);
    if(is2D&&!record.values.image?.trim())issues.push(`${record.name}: thiếu ảnh 2D`);
    if(key==='displays'&&!is2D&&!data.materials.some(r=>r.name===record.values.label&&r.values.model===record.values.model&&r.status==='Đang bật'))issues.push(`${record.name}: nhãn không tương thích hoặc đang tắt`);
    for(const color of is2D?[]:['color','capColor','liquidColor'])if(record.values[color]&&!/^#[0-9a-f]{6}$/i.test(record.values[color]))issues.push(`${record.name}: màu không hợp lệ`);
   }
  }
  setChecks(issues);setNotice(issues.length?'':'Bản mẫu đã qua kiểm tra dữ liệu.');return issues;
 }
 function publish(){if(preflight().length)return;const version=`0.1.${data.releases.length}`;const next=rowRelease(version);update({...data,releases:[next,...data.releases.map(r=>({...r,status:r.status==='Đang sử dụng'?'Đã phát hành':r.status}))]},`Đã tạo phiên bản mẫu ${version}.`);}
 function rowRelease(version:string):ManagementRecord{return {id:crypto.randomUUID(),name:`Phiên bản ${version}`,status:'Đang sử dụng',updated:date(),values:{version,author:'Quản trị viên',note:'Bản phát hành mô phỏng',snapshot:JSON.stringify(Object.fromEntries(Object.entries(persistentManagementData(data)).filter(([key])=>key!=='releases')))}};}
 function rollback(record:ManagementRecord){let snapshot:Record<string,ManagementRecord[]>;try{snapshot=JSON.parse(record.values.snapshot);if(!snapshot||!Array.isArray(snapshot.models)||!Array.isArray(snapshot.displays))throw new Error();}catch{setNotice('Phiên bản này không có bản lưu hợp lệ để khôi phục.');close();return;}update({...data,...snapshot,releases:data.releases.map(r=>({...r,status:r.id===record.id?'Đang sử dụng':'Đã phát hành'}))},`Đã dùng lại phiên bản mẫu ${record.values.version}.`);close();}
 function download(){const blob=new Blob([JSON.stringify(persistentManagementData(data)[tab.id],null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=`labellab-${tab.id}.json`;link.click();URL.revokeObjectURL(url);setNotice('Đã xuất JSON.');}
 return <div className={s.root}>
  <div className={s.top}><div className={s.tabs} role="group" aria-label="Nhóm quản lý">{tabs.map(t=><button key={t.id} type="button" aria-pressed={tab.id===t.id} onClick={()=>{setSelected(t.id);setSearch('');setFilter('all');setPage(1);setChecks(null);setNotice('');}}>{t.name}<span>{data[t.id]?.length??0}</span></button>)}</div></div>
  <div className={s.toolbar}><label className={s.search}><Search size={18}/><input aria-label="Tìm kiếm" placeholder="Tìm kiếm…" value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}}/></label><select aria-label="Lọc trạng thái" value={filter} onChange={e=>{setFilter(e.target.value);setPage(1);}}><option value="all">Tất cả trạng thái</option>{Array.from(new Set(rows.map(r=>r.status))).map(status=><option key={status}>{status}</option>)}</select><div className={s.spacer}/><button type="button" onClick={download}><ArrowDownToLine size={17}/>Xuất JSON</button>{section==='assets'&&<><input ref={upload} hidden type="file" multiple accept=".glb,.gltf,.png,.jpg,.jpeg,.webp,.svg,.hdr,.exr,.zip,.psd" onChange={e=>stage(e.target.files)}/><button type="button" className={s.primary} onClick={()=>upload.current?.click()}><Upload size={17}/>Thêm file</button></>}{section==='releases'?<><button type="button" onClick={preflight}><CheckCircle2 size={17}/>Kiểm tra</button><button type="button" className={s.primary} onClick={publish}><Upload size={17}/>Phát hành bản mẫu</button></>:<button type="button" className={s.primary} onClick={newRecord}><Plus size={17}/>Thêm mới</button>}</div>
  {notice&&<div role="status" className={s.notice}><Check size={16}/>{notice}<button type="button" aria-label="Đóng thông báo" onClick={()=>setNotice('')}><X size={15}/></button></div>}
  {checks&&checks.length>0&&<div className={s.errors} role="alert"><strong>{checks.length} lỗi cần sửa</strong>{checks.map((issue,i)=><div key={i}>{issue}</div>)}</div>}
  <div className={s.tableWrap}><table><thead><tr><th>Tên</th>{tab.columns.map(key=><th key={key}>{tab.fields.find(field=>field.key===key)?.label??fieldLabels[key]??key}</th>)}<th>Trạng thái</th><th>Cập nhật</th><th className={s.actionHead}>Thao tác</th></tr></thead><tbody>{filtered.slice((currentPage-1)*10,currentPage*10).map(record=><tr key={record.id}><td><button type="button" className={s.recordName} onClick={()=>open(record,'view')}>{record.poster&&!record.poster.startsWith('blob:')?<img src={record.poster} width={36} height={44} alt=""/>:<FileBox size={23} className={s.fileIcon}/>}<strong>{record.name}</strong></button></td>{tab.columns.map(key=><td key={key}><span className={s.cell} title={record.values[key]}>{record.values[key]||'—'}</span></td>)}<td>{record.status==='Đang bật'||record.status==='Đang tắt'?<button type="button" role="switch" aria-label={`Bật ${record.name}`} aria-checked={record.status==='Đang bật'} className={s.switch} onClick={()=>toggle(record)}><span/><small>{record.status==='Đang bật'?'Bật':'Tắt'}</small></button>:<span className={`${s.badge} ${record.status==='Đang sử dụng'?s.active:''}`}>{record.status}</span>}</td><td className={s.date}>{record.updated}</td><td><div className={s.actions}><button type="button" aria-label={`Xem ${record.name}`} onClick={()=>open(record,'view')}><Eye size={17}/></button>{section!=='releases'&&<><button type="button" aria-label={`Sửa ${record.name}`} onClick={()=>open(record,'edit')}><Pencil size={16}/></button><button type="button" aria-label={`${record.status==='Lưu trữ'?'Khôi phục':'Lưu trữ'} ${record.name}`} onClick={()=>archive(record)}>{record.status==='Lưu trữ'?<RotateCcw size={16}/>:<Archive size={16}/>}</button></>}{record.status!=='Đang sử dụng'&&<button type="button" aria-label={`Xóa ${record.name}`} className={s.delete} onClick={()=>open(record,'delete')}><Trash2 size={16}/></button>}</div></td></tr>)}</tbody></table>{!filtered.length&&<div className={s.empty}><Search size={24}/><strong>Không có kết quả</strong><button type="button" onClick={()=>{setSearch('');setFilter('all');}}>Xóa bộ lọc</button></div>}</div>
  <div className={s.footer}><span>{filtered.length} mục</span><div><button type="button" disabled={currentPage===1} onClick={()=>setPage(currentPage-1)}>Trước</button><span>{currentPage} / {pages}</span><button type="button" disabled={currentPage===pages} onClick={()=>setPage(currentPage+1)}>Sau</button></div></div>
  {editor&&<dialog ref={modal} className={s.dialog} aria-labelledby="management-dialog-title" onCancel={close} onClick={event=>{if(event.target===modal.current){const rect=modal.current.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)close();}}}>
   <header><h2 id="management-dialog-title">{editor.mode==='delete'?'Xóa mục':editor.mode==='view'?editor.record.name:rows.some(r=>r.id===editor.record.id)?'Chỉnh sửa':'Thêm mới'}</h2><button type="button" aria-label="Đóng" onClick={close}><X size={21}/></button></header>
   {editor.mode==='delete'?<><p className={s.deleteCopy}>Xóa “{editor.record.name}” khỏi dữ liệu mẫu?</p><footer><button type="button" autoFocus onClick={close}>Hủy</button><button type="button" className={s.danger} onClick={()=>{update({...data,[tab.id]:rows.filter(r=>r.id!==editor.record.id)},'Đã xóa khỏi bản mẫu.');close();}}>Xóa</button></footer></>:editor.mode==='view'?<><div className={s.details}>{editor.record.poster&&<img className={s.preview} src={editor.record.poster} alt={editor.record.name}/>}<dl><div><dt>Trạng thái</dt><dd>{editor.record.status}</dd></div>{tab.fields.map(field=><div key={field.key}><dt>{field.label}</dt><dd>{editor.record.values[field.key]||'—'}</dd></div>)}<div><dt>Cập nhật</dt><dd>{editor.record.updated}</dd></div></dl></div><footer><button type="button" onClick={close}>Đóng</button>{section==='releases'&&editor.record.status!=='Đang sử dụng'?<button type="button" className={s.primary} onClick={()=>rollback(editor.record)}><RotateCcw size={16}/>Dùng lại bản mẫu</button>:section!=='releases'&&<button type="button" className={s.primary} onClick={()=>setEditor({...editor,mode:'edit'})}><Pencil size={16}/>Chỉnh sửa</button>}</footer></>:<form onSubmit={save}><div className={s.fields}><label className={s.full}>Tên<input autoFocus required value={editor.record.name} onChange={e=>setEditor({...editor,record:{...editor.record,name:e.target.value}})}/></label>{tab.fields.map(field=><label key={field.key} className={field.type==='textarea'?s.full:undefined}>{field.label}{field.required?' *':''}{field.type==='select'?<select required={field.required} value={editor.record.values[field.key]??''} onChange={e=>setEditor({...editor,record:{...editor.record,values:{...editor.record.values,[field.key]:e.target.value}}})}>{field.options?.map(option=><option key={option}>{option}</option>)}</select>:field.type==='textarea'?<textarea rows={3} required={field.required} value={editor.record.values[field.key]??''} onChange={e=>setEditor({...editor,record:{...editor.record,values:{...editor.record.values,[field.key]:e.target.value}}})}/>:<input type={field.type??'text'} step={field.type==='number'?'any':undefined} min={field.min} max={field.max} required={field.required} value={editor.record.values[field.key]??''} onChange={e=>setEditor({...editor,record:{...editor.record,values:{...editor.record.values,[field.key]:e.target.value}}})}/>}</label>)}</div>{error&&<p className={s.errors} role="alert">{error}</p>}<footer><button type="button" onClick={close}>Hủy</button><button type="submit" className={s.primary}><Check size={17}/>Lưu</button></footer></form>}
  </dialog>}
 </div>;
}
