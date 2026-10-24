# Phân tích Unity_3D_Mockup_Project (20/10/2026)

## Tổng quan kỹ thuật
- Unity 6000.0.44f1 (Unity 6), HDRP 17.0.4; scenes Intro_Scene, Master_Scene, Simple_Scene_2 (Web Studio), Simple_Scene (HDRI), Miniatures_Scene.
- Packages: Addressables 2.3.16, Recorder 5.1.5, Timeline, UGUI, Visual Scripting; PlayFab SDK projects tồn tại nhưng không có token/payment/auth gameplay.
- Đây là desktop/standalone app; WebGL chưa được chứng minh. HDRP/DXR/compute và Windows native file dialog là rủi ro khi chuyển web.

## Tài sản sản phẩm
- Assets/Data/3D Model khoảng 40 FBX: PET 320/330ml, 500ml, 1L/1.5L, PP 1L/1.25L, lon 180/250/320/330/500ml, chai thủy tinh 280/290/300ml, khay/tray/carton.
- Assets/Data/Prefab bottle and can có 40+ prefab; thêm Prefab Tray, Carton, Pack 6, podium và 8 podium FBX.
- Addressable labels: Data_Prefabs, Data_Podiums, liquid groups/material collection; runtime spawn trong Master_Scene qua runtimeContentRoot.
- Material Collection gồm Milk, Nata de coco và preset liquid; HDRI/studio assets ở Assets/Data/HDRI, Resources.

## Luồng chức năng hiện có
- ProductView: metadata displayName/category/packagingMaterial/capacity; CustomizablePart với role Material/Liquid/Label/Tray, màu, smoothness, metallic, custom float, label/tray import; runtime material instances.
- CustomizationManager: tải product/podium qua Addressables; điều hướng dung tích/vật liệu; quản lý liquid, label texture, scene/environment persistence.
- MaterialCustomizationPanel, LabelCustomizationUI, LabelImportPanelController: chỉnh màu/roughness/metallic/preset; import label zoom/pan/crop/offset.
- ProductCameraOrbit: orbit, zoom, pan, FOV, xoay; camera presets và capture focus.
- ScreenshotManager và Standard/SeamlessTiled/Tiled renderers: ảnh thường/tiled, Low/Good/Ultra, transparent PNG nhiều pass (beauty, silhouette, glass reflection) và alpha reconstruction. PhotoVideoCapturePanel + RuntimeVideoRecorder hỗ trợ video turntable/zoom.
- Glass290WebRenderer/Data: web-optics Low/Optimal cho 290ml Basil/Chia/Milk (Van/Keo), seeded liquid; WebStudioPetOpticalPipeline cho 320ml PET; WebStudioEnvironment, WebShowcaseBackground, custom PBR tone mapping cho studio.
- Shader graph/HDRP custom: Bottle Glass, Energy Drink, Juice, Nata de coco, Chia Seed, Basil Seed Gel, Aloe Vera; transparent/refraction coverage passes.
- LauncherSessionValidator/IntroManager chỉ xác thực PlayFab session ticket. Không có registration/login/password reset/token ledger/payment APIs.

## Export/build
- BUILD_LABEL_LAB_RELEASE.bat build Windows release, Addressables ServerData/StandaloneWindows64, signed manifest, Cloudflare R2; LabelLabReleaseBuild validates PlayFab Title ID 1ACF78.
- Capture ghi PNG/MP4 cục bộ qua Windows APIs. Browser cần input file/blob URL và server render hoặc WebGL GPU path.
- WEB_STUDIO_MODE.md ghi nhận transparent/tiled captures, fixed HDRI, 14 backgrounds, web optics; tests ở Diagnostics/.

## Web reuse recommendation
1. Reuse FBX/prefab/UV/material và ProductView metadata làm catalog; convert glTF/GLB (Draco/KTX2) hoặc Addressables WebGL; schema product gồm id/category/capacity/model URL/material slots/label UV/quality.
2. Reuse label crop/UV, material ranges, camera orbit/presets và studio palette. Port shader chọn lọc sang Three.js/Babylon/WebGPU; giữ HDRP optics cho server/desktop fallback.
3. Xây client editor + backend auth, projects, token ledger, payments, daily free/spin, referral, promotions. Token decrement phải server-side, idempotent.
4. MVP preview WebGL/WebGPU PBR và server queue (Unity headless/Blender) cho PNG/video; trừ token khi job thành công.
5. PlayFab launcher là legacy desktop; web auth dùng managed identity/OAuth, email verify, reset, refresh, RBAC.

## Risks/gaps
- HDRP 17/DXR/custom passes, compute, native dialogs, Addressables StandaloneWindows64 không portable trực tiếp WebGL.
- FBX tối đa khoảng 13MB và nhiều variant; cần LOD, compression, lazy loading, CDN.
- Chưa có payment, token economy, anti-abuse, privacy, webhook reconciliation hoặc admin CMS.
- Audit license/provenance assets/fonts trước thương mại.
