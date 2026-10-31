import { LAB_MODELS } from '@/lib/labellab/catalog';

export type ManagementSection = 'models' | 'assets' | 'content' | 'promotions' | 'releases';
export type ManagementRecord = { id: string; name: string; status: string; updated: string; values: Record<string, string>; poster?: string };
export type ManagementField = { key: string; label: string; type?: 'number' | 'date' | 'textarea' | 'select'; options?: string[]; required?: boolean; min?: number; max?: number };
export type ManagementTab = { id: string; name: string; fields: ManagementField[]; columns: string[] };
const f = (key: string, label: string, type?: ManagementField['type'], options?: string[]): ManagementField => ({ key, label, type, options });
export const managementTabs: Record<ManagementSection, ManagementTab[]> = {
  models: [
    { id:'models', name:'Model 3D', columns:['category','volume','file'], fields:[f('category','Danh mục','select',['Chai thủy tinh','Lon nhôm','Chai PET','Túi','Hộp','Khác']),f('volume','Dung tích'),{...f('file','Đường dẫn GLB'),required:true},f('poster','Đường dẫn ảnh đại diện'),f('uv','Mã UV'),f('yaw','Góc mặt trước (radian)','number'),f('slots','Ánh xạ vật liệu','textarea')] },
    { id:'categories', name:'Danh mục', columns:['code','order'], fields:[{...f('code','Mã danh mục'),required:true},f('order','Thứ tự','number')] },
    { id:'materials', name:'Nhãn & vật liệu', columns:['model','uv','roughness'], fields:[{...f('model','Model tương thích','select',LAB_MODELS.map(m=>m.name)),required:true},f('uv','Mã UV'),f('texture','Đường dẫn nhãn'),{...f('roughness','Độ nhám','number'),min:0,max:1},{...f('metalness','Độ kim loại','number'),min:0,max:1},f('color','Màu chất lỏng')] },
    { id:'displays', name:'Cấu hình hiển thị', columns:['model','mode','label'], fields:[f('mode','Kiểu hiển thị','select',['3D','2D']),f('model','Model','select',LAB_MODELS.map(m=>m.name)),f('label','Nhãn / vật liệu'),f('image','Ảnh 2D'),f('alt','Mô tả ảnh'),{...f('offset','Offset nhãn (%)','number'),min:-50,max:50},f('capColor','Màu nắp'),f('liquidColor','Màu chất lỏng'),f('order','Thứ tự','number')] },
  ],
  assets:[{id:'assets',name:'Kho tài nguyên',columns:['type','size','file'],fields:[f('type','Loại','select',['Model GLB','Texture','HDRI','Thumbnail','Template']),{...f('file','Đường dẫn / tên file'),required:true},f('size','Dung lượng'),f('usage','Sử dụng tại')]}],
  content:[
    {id:'banners',name:'Banner',columns:['placement','order'],fields:[f('placement','Vị trí','select',['Trang chủ · đầu trang','Trang chủ · cuối trang','Thư viện']),{...f('image','Đường dẫn ảnh'),required:true},f('url','Liên kết'),f('alt','Mô tả ảnh'),f('order','Thứ tự','number')]},
    {id:'announcements',name:'Thông báo',columns:['start','end'],fields:[{...f('text','Nội dung','textarea'),required:true},f('start','Bắt đầu','date'),f('end','Kết thúc','date'),f('url','Liên kết')]},
    {id:'layout',name:'Trang chủ',columns:['placement','order'],fields:[f('placement','Khu vực'),f('order','Thứ tự','number')]},
  ],
  promotions:[
    {id:'rewards',name:'Điểm danh & quà tặng',columns:['reward','limit','schedule'],fields:[{...f('reward','Coin mỗi lượt','number'),min:0}, {...f('limit','Giới hạn mỗi người / ngày','number'),min:0},f('schedule','Lịch thưởng / danh sách coin'),f('condition','Điều kiện','textarea')]},
    {id:'campaigns',name:'Chiến dịch',columns:['start','end','reward'],fields:[f('start','Bắt đầu','date'),f('end','Kết thúc','date'),{...f('reward','Coin thưởng','number'),min:0}, {...f('limit','Tổng lượt tối đa','number'),min:0},f('condition','Điều kiện','textarea')]},
    {id:'coupons',name:'Mã ưu đãi',columns:['code','discount','limit'],fields:[{...f('code','Mã ưu đãi'),required:true},{...f('discount','Giảm giá (%)','number'),min:0,max:100},{...f('limit','Giới hạn lượt dùng','number'),min:0},f('end','Hết hạn','date'),f('region','Khu vực','select',['Tất cả','Việt Nam','Quốc tế'])]},
  ],
  releases:[{id:'releases',name:'Lịch sử phiên bản',columns:['version','author','note'],fields:[f('version','Phiên bản'),f('author','Người phát hành'),f('note','Ghi chú','textarea')]}],
};
export const fieldLabels = Object.fromEntries(Object.values(managementTabs).flat().flatMap(t=>t.fields).map(field=>[field.key,field.label]));
managementTabs.models[0].fields.push(f('rotationX','Góc xoay X (radian)','number'),f('rotationY','Góc xoay Y (radian)','number'),f('rotationZ','Góc xoay Z (radian)','number'),f('order','Thứ tự trong thư viện','number'));
/** Object URLs belong to one browser session and must never enter persistent fixtures. */
export function persistentManagementData(data:Record<string,ManagementRecord[]>):Record<string,ManagementRecord[]> {
 return Object.fromEntries(Object.entries(data).map(([key,records])=>[key,records.map(record=>({...record,poster:record.poster?.startsWith('blob:')?undefined:record.poster,values:Object.fromEntries(Object.entries(record.values).map(([name,value])=>[name,value.startsWith('blob:')?'':value]))}))]));
}
const row=(id:string,name:string,values:Record<string,string>,status='Đang bật'):ManagementRecord=>({id,name,values,status,updated:'31/10/2026'});
export function createManagementData():Record<string,ManagementRecord[]> {
 const data:Record<string,ManagementRecord[]> = {
 models:LAB_MODELS.map((m,i)=>({...row(m.id,m.name,{category:({glass:'Chai thủy tinh',can:'Lon nhôm',pet:'Chai PET'})[m.category],volume:m.volume,file:m.asset.src,poster:m.poster,uv:`${m.category}-wrap`,yaw:String(m.frontYaw),slots:JSON.stringify(m.asset.materialSlots??{},null,2),rotationX:String(m.asset.orientation?.[0]??0),rotationY:String(m.asset.orientation?.[1]??0),rotationZ:String(m.asset.orientation?.[2]??0),order:String(i+1)}),poster:m.poster})),
 categories:[row('glass','Chai thủy tinh',{code:'glass',order:'1'}),row('can','Lon nhôm',{code:'can',order:'2'}),row('pet','Chai PET',{code:'pet',order:'3'})],
 materials:LAB_MODELS.map(m=>row(`mat-${m.id}`,`Nhãn ${m.name}`,{model:m.name,uv:`${m.category}-wrap`,texture:'',roughness:String(m.appearance.slots?.label?.roughness??.15),metalness:'0',color:m.appearance.slots?.liquid?.color??'#ffffff'})),
 displays:LAB_MODELS.map((m,i)=>row(`display-${m.id}`,m.name,{model:m.name,mode:'3D',label:`Nhãn ${m.name}`,order:String(i+1)})),
 assets:LAB_MODELS.map(m=>({...row(`asset-${m.id}`,m.name,{type:'Model GLB',file:m.asset.src,size:'—',usage:'Studio / Demo'}),poster:m.poster})),
 banners:[row('banner-1','Bộ sưu tập mới',{placement:'Trang chủ · đầu trang',image:'/branding/LLLogo.svg',url:'/studio',alt:'Labellab',order:'1'},'Đang tắt')],
 announcements:[row('notice-1','Chào mừng đến Labellab',{text:'Create your next packaging mockup.',start:'2026-10-31',end:'2026-12-31',url:'/studio'},'Đang tắt')],
 layout:['Demo 3D','Thư viện model','Thông tin người dùng','Điểm danh','Bảng giá coin'].map((name,i)=>row(`layout-${i}`,name,{placement:'Trang chủ',order:String(i+1)})),
 rewards:[row('checkin','Điểm danh hằng ngày',{reward:'1',limit:'1',schedule:'1, 1, 2, 2, 3, 3, 5',condition:'Đăng nhập; một lần mỗi ngày.'}),row('wheel','Vòng quay hằng ngày',{reward:'0',limit:'1',schedule:'0, 1, 2, 3, 5, 10',condition:'Cấu hình mẫu; xác suất sẽ thiết lập khi nối backend.'},'Đang tắt'),row('share','Chia sẻ website',{reward:'2',limit:'1',schedule:'Hằng ngày',condition:'Chia sẻ hợp lệ sau khi xác minh.'},'Đang tắt'),row('free-download','Lượt tải miễn phí',{reward:'0',limit:'1',schedule:'Hằng ngày',condition:'Một lượt tải mỗi ngày.'})],
 campaigns:[row('welcome','Quà thành viên mới',{start:'2026-10-31',end:'2026-12-31',reward:'5',limit:'1000',condition:'Xác minh email lần đầu.'},'Đang tắt')],
 coupons:[row('coupon-welcome','Ưu đãi ra mắt',{code:'WELCOME10',discount:'10',limit:'100',end:'2026-12-31',region:'Tất cả'},'Đang tắt')],
 releases:[row('release-demo','Bản dựng giao diện',{version:'0.1.0',author:'Quản trị viên',note:'Dữ liệu mẫu ban đầu'},'Đang sử dụng')],
 };
 data.releases[0].values.snapshot=JSON.stringify(Object.fromEntries(Object.entries(data).filter(([key])=>key!=='releases')));
 return data;
}
