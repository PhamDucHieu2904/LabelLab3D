import type { UiLocale } from "./locale";

export type StudioMessages = {
  skipToStudio: string;
  eyebrowBeverage: string;
  eyebrowPackaging: string;
  heroBeverageLead: string;
  heroBeverageAccent: string;
  heroPackagingLead: string;
  heroPackagingAccent: string;
  exploreStudio: string;
  domains: {
    beverage: string;
    packaging: string;
    apparel: string;
    soon: string;
  };
  actions: {
    restoreDefaults: string;
    restoreDefaultsTitle: string;
    saveProject: string;
    saveProjectTitle: string;
  };
  rail: {
    models: string;
    templates: string;
    label: string;
    liquid: string;
    cap: string;
    top: string;
    bottle: string;
    body: string;
    scene: string;
    sizeSpec: string;
    packBottles: string;
    material: string;
    structure: string;
    proCad: string;
    design: string;
    headingPackBottles: string;
    headingBoardMaterial: string;
    headingStructure: string;
    headingProCad: string;
    headingBoxDesign: string;
    headingTopTab: string;
    headingCanBody: string;
    headingSizeSpec: (code: string) => string;
  };
  library: {
    modelLibrary: string;
    boxTemplates: string;
    searchPackaging: string;
    searchTemplates: string;
    filterCategory: string;
    filterModels: string;
    resetFilter: string;
    honeycombDividers: string;
    honeycombCells: (count: number) => string;
    catAll: string;
    catGlass: string;
    catCans: string;
    catPet: string;
    catPp: string;
    catTrays: string;
    catCarriers: string;
    catRigid: string;
    catCartons: string;
    catMailers: string;
    catRetail: string;
    kindGlass: string;
    kindCan: string;
    kindPet: string;
    kindPp: string;
    noModels: string;
    clearFilters: string;
    pageOf: (page: number, total: number) => string;
    comingSoon: string;
  };
  viewport: {
    animated: string;
    reset: string;
    zoomIn: string;
    zoomOut: string;
    fullscreen: string;
    scene1Title: string;
    scene2Title: string;
    styleWhite: string;
    stylePink: string;
    styleDark: string;
    styleToggleToPink: string;
    styleToggleToWhite: string;
    styleToggleToDark: string;
    graphicsQuality: string;
    qualityAuto: (tier?: string) => string;
    qualityLow: string;
    qualityMedium: string;
    qualityHigh: string;
    qualityUltra: string;
    qualityDescAuto: string;
    qualityDescLow: string;
    qualityDescMedium: string;
    qualityDescHigh: string;
    qualityDescUltra: string;
    hoverOutside: string;
    hoverInside: string;
    hoverLabel: string;
    hoverClickReplace: string;
    hoverClickReplaceAll: (count: number) => string;
    camIso: string;
    camFront: string;
    camTop: string;
    camSide: string;
    camInside: string;
    foldOpen: string;
    foldClose: string;
    viewSplit: string;
    faces: string;
    viewLabel: (index: number) => string;
  };
  scenePanel: {
    bgAndEnv: string;
    whiteStudio: string;
    whiteStudioSub: string;
    bgColor: string;
    envLighting: string;
    envLightingHint: string;
    envPresets: Record<
      "studio-original" | "studio-bright" | "softbox-contrast" | "daylight-window" | "nature-garden" | "cool-minimal",
      { label: string; detail: string }
    >;
    spotLight: string;
    spotLightHint: string;
    spotPresetTop: string;
    spotPresetHero: string;
    spotPresetRim: string;
    spotIntensity: string;
    spotAngle: string;
    spotHeight: string;
    spotColor: string;
    spotColors: Record<"white" | "warm" | "cool" | "rose", string>;
    animatedGrid: string;
    productHighlight: string;
    motion: string;
    motionWebsite: string;
    motionWebsiteSub: string;
    motionIdle: string;
    motionIdleSub: string;
  };
  properties: {
    artworkOffset: string;
    artworkOffsetHint: string;
    liquidAppearance: string;
    topAndTab: string;
    capFinish: string;
    surfaceFinish: string;
    labelFinish: string;
    textureReflection: string;
    fineTuneLight: string;
    restoreModelDefaults: string;
    liquidType: string;
    colorPresets: string;
    custom: string;
    liquidColor: string;
    clarity: string;
    density: string;
    turbidity: string;
    brightness: string;
    sparkling: string;
    fineTune: (name: string) => string;
    ior: string;
    scattering: string;
    liquidRoughness: string;
    capColor: string;
    topColor: string;
    bodyColor: string;
    metallic: string;
    roughness: string;
    helpCap: string;
    helpBody: string;
    helpLabel: string;
    addArtwork: string;
    savedLabelHistory: string;
    clearLabel: string;
    artworkEditorSubtitle: string;
    savedSubheading: (name: string) => string;
    savedEmptyText: (name: string) => string;
  };
  render: {
    heading: string;
    loadingPreview: string;
    aspectRatio: string;
    resolution: string;
    frameSquare: string;
    framePortrait: string;
    frameLandscape: string;
    frameStory: string;
    isTransparent: string;
    rendering: string;
    renderButton: string;
    preparingImage: string;
    renderingPct: (pct: number) => string;
    downloadImage: string;
    dielineTitle: string;
    dielineSub: string;
    free: string;
  };
  projectsModal: {
    eyebrow: string;
    title: string;
    subtitle: string;
    searchPlaceholder: string;
    countSummary: (projectsCount: number, itemsCount: number) => string;
    share3d: string;
    manageLink: string;
    open: string;
    viewItems: (count: number) => string;
    hideItems: string;
    deleteProject: string;
    deleteItem: string;
    sharedBadge: (views: number) => string;
    pausedBadge: string;
    bottlesUnit: (count: number) => string;
    boxesUnit: (count: number) => string;
    customLabel: string;
    emptyTitle: string;
    emptyBody: string;
    noSearchMatch: string;
    backToStudio: string;
    closeAria: string;
    filterAll: string;
    filterShared: string;
    filterExpiring: string;
    cloudQuota: (used: number, max: number) => string;
    retentionRuleChip: (days: number, cost: number) => string;
    daysLeft: (days: number) => string;
    expiresToday: string;
    autoRenewLabel: string;
    autoRenewTooltip: (cost: number) => string;
    extendBtn: (days: number, cost: number) => string;
    extendFreeBtn: (days: number) => string;
    extending: string;
    localOnlyBadge: string;
    syncToCloud: string;
    syncingCloud: string;
    guestBannerTitle: string;
    guestBannerBody: string;
    signInBtn: string;
    backToAllProjects: string;
    openInStudio: string;
    confirmDelete: string;
    cancelDelete: string;
    loadingItem: string;
    emptyFilterMatch: string;
  };
  saveDialog: {
    eyebrowBeverage: string;
    eyebrowPackaging: string;
    title: string;
    projectCollectionLabel: string;
    createNewCollection: string;
    newProjectName: string;
    newProjectPlaceholder: string;
    flavorItemLabel: string;
    boxItemLabel: string;
    flavorPlaceholder: string;
    boxPlaceholder: string;
    saveAsNewItem: string;
    updateItem: (name: string) => string;
    itemsUnit: (count: number) => string;
    usingDefaultLabel: string;
    customLabelIncluded: string;
    noticeBeverageTitle: string;
    noticeBeverageBody: string;
    noticePackagingTitle: string;
    noticePackagingBody: string;
    cloudRetentionTitle: (days: number) => string;
    cloudRetentionBody: (cost: number) => string;
    autoRenewCheckbox: (cost: number) => string;
    guestSaveNotice: string;
    cancel: string;
    save: string;
    saving: string;
    errItemNameRequired: string;
    errGroupNameRequired: string;
  };
  shareDialog: {
    eyebrow: string;
    title: (name: string) => string;
    liveLink: string;
    pausedLink: string;
    viewsCount: (count: number) => string;
    passcodeOn: string;
    copy: string;
    copied: string;
    openPreview: string;
    pauseLink: string;
    resumeLink: string;
    revokeDelete: string;
    includedObjects: (selected: number, total: number) => string;
    includedHint: string;
    defaultView: string;
    boxTrayLabel: string;
    reviewTitle: string;
    reviewTitlePlaceholder: string;
    brandStudio: string;
    brandPlaceholder: string;
    clientNote: string;
    clientNotePlaceholder: string;
    linkExpiry: string;
    exp7d: string;
    exp30d: string;
    exp90d: string;
    expNever: string;
    accessProtection: string;
    requirePasscode: string;
    newPasscodeHint: string;
    passcodeHint: string;
    passcodePlaceholderUnchanged: string;
    passcodePlaceholderNew: string;
    allowFold: string;
    allowDimensions: string;
    allowBgSwitch: string;
    costFreeUpdate: string;
    costNewPaid: (coins: number) => string;
    costNewFree: string;
    close: string;
    publishing: string;
    syncUpdates: string;
    createLinkPaid: (coins: number) => string;
    createLinkFree: string;
    optimizingArtwork: (done: number, total: number) => string;
    compressingArtwork: (done: number, total: number) => string;
    uploadingAssets: (count: number, size: string) => string;
    closeAria: string;
    errCopyFailed: string;
    errTitleRequired: string;
    errSelectOne: string;
    errPasscodeLength: (min: number, max: number) => string;
    errInsufficientCoins: (coins: number) => string;
    errShareLimitReached: (max: number) => string;
    errPayloadTooLarge: string;
    errPublishFailed: string;
    errUpdateStatusFailed: string;
    errRevokeFailed: string;
  };
  guide: {
    title: string;
    steps: readonly { title: string; body: string }[];
  };
  toasts: {
    savedItem: (itemName: string, groupName: string) => string;
    deletedName: (name: string) => string;
    deletedProject: (name: string) => string;
    loadedName: (name: string) => string;
    imageReady: string;
    signInRender: (coins: number, resolution: number) => string;
    signInRenderFree: string;
    needCoinsRender: (coins: number, resolution: number) => string;
    renderChargeFailed: string;
    renderFailed: string;
    fullscreenUnavailable: string;
    defaultRestored: string;
    restoredTemplateDefaults: (code: string) => string;
    clearedBoxArtworks: string;
    apparelComingSoon: string;
    dielineSignInPaid: (coins: number) => string;
    dielineSignInFree: string;
    dielineNeedCoins: (coins: number, fmt: string) => string;
    dielineStartFailed: string;
    dielineFailed: string;
    dielineDownloaded: (fmt: string, width: number, height: number, coins: number) => string;
    shareLivePaid: (coins: number) => string;
    shareUpdated: string;
    shareRevoked: string;
    signInSharePaid: (coins: number) => string;
    signInShareFree: string;
    savedCloudItem: (itemName: string, groupName: string) => string;
    extendedProject: (name: string, days: number, coins: number) => string;
    autoRenewEnabled: (name: string, cost: number) => string;
    autoRenewDisabled: (name: string) => string;
    migratedToCloud: (name: string) => string;
    needCoinsExtend: (coins: number) => string;
    projectLimitReached: (max: number) => string;
    cloudActionFailed: string;
  };
  packaging: {
    dimensionsTitle: string;
    inner: string;
    outer: string;
    innerTitle: string;
    outerTitle: string;
    resetParamsTitle: string;
    length: string;
    width: string;
    height: string;
    oppositeSize: (mode: "inner" | "outer") => string;
    blankAndWeight: string;
    fitBadge: string;
    packTitle: string;
    packComboBadge: string;
    packIntro: (shortName: string) => string;
    myProjectsTab: (count: number) => string;
    catalogTab: string;
    customLabelTag: string;
    customizeNewBottle: string;
    noCustomProjectsLead: string;
    noCustomProjectsHighlight1: string;
    noCustomProjectsMid: string;
    noCustomProjectsHighlight2: string;
    noCustomProjectsTail: string;
    goCustomizeBottle: string;
    myCustomProjectsGroup: string;
    groupCans: string;
    groupGlass: string;
    groupPet: string;
    groupPp: string;
    customTag: (name: string) => string;
    activeTag: (name: string) => string;
    labelSyncedTag: string;
    activeStudioModelTag: string;
    replaceAllLabels: (count: number) => string;
    replaceAllLabelsTitle: string;
    resetShort: string;
    resetLabelTitle: string;
    gridPresetLabel: (cols: number, rows: number, defaultLabel: string) => string;
    colsLabel: string;
    rowsLabel: string;
    fitCleanly: (count: number) => string;
    tightBy: (detail: string) => string;
    packCountUnit: (count: number) => string;
    autoFitCta: (count: number, vol: string) => string;
    bottleSpacing: string;
    labelFacingAngle: string;
    autoResizeOnGrid: string;
    organicJitter: string;
    rerollAngles: string;
    boardMaterialTitle: string;
    outsideLabel: string;
    insideLabel: string;
    surfaceFinish: string;
    printFinishTitle: string;
    printFinishBadge: string;
    applyArea: string;
    targetAutoArt: string;
    targetFrame: string;
    targetFull: string;
    tactileRelief: (dir: "emboss" | "deboss" | "flat") => string;
    finishStrength: string;
    artworkMaskSens: string;
    invertFinishMask: string;
    uploadFinishMask: string;
    maskSelected: (name: string) => string;
    clearShort: string;
    finishEmptyHint: string;
    finishActiveHint: string;
    finishPresetLabel: (id: string, fallback: string) => string;
    structureTitle: string;
    carrierPackLayout: string;
    carrierPackBtn: (layout: "4-pack" | "6-pack" | "8-pack") => string;
    internalDividers: string;
    lidSkirtDepth: string;
    lockTabsPerSide: string;
    oneTab: string;
    twoTabs: string;
    lockTabWidth: string;
    tuckStyle: string;
    tuckReverse: string;
    tuckStraight: string;
    tuckFlapLength: string;
    sideFlapGap: string;
    topBottomFlapGap: string;
    dustFlapTaper: string;
    thumbNotch: string;
    frontDisplayScoop: string;
    scoopDepth: string;
    carryHandHoles: string;
    sideHandHoles: string;
    handleWidth: string;
    windowCutout: string;
    windowWidth: string;
    windowHeight: string;
    windowFilm: string;
    proCadTitle: string;
    proCadBadge: string;
    boardCaliper: string;
    fluteDirection: string;
    alongL: string;
    alongW: string;
    lockFoldClearance: string;
    printBleedMargin: string;
    showCreaseGuidelines: string;
    netSheetArea: string;
    panelsAndCreases: string;
    panelsFoldsValue: (panels: number, folds: number) => string;
    artworkTipLead: string;
    artworkTipBody: string;
    printSide: string;
    boxFacesTitle: (side: "outside" | "inside") => string;
    faceCount: (count: number) => string;
    faceCustom: string;
    faceEmpty: string;
    btnAdd: string;
    btnReplace: string;
    uploadFaceArt: (code: string) => string;
    replaceFaceArt: (code: string) => string;
    faceTint: string;
    resetTint: string;
    removeFaceArt: (code: string) => string;
    quickTextOn: (code: string) => string;
    textPlaceholder: (code: string) => string;
    textColor: string;
    textSize: string;
    clearAllFaces: string;
    faceLabel: (englishLabel: string) => string;
    dielineBlank: string;
    dielineCut: string;
    dielineCrease: string;
    dielineBleed: string;
    modalFaceSubtitle: (label: string, surface: string) => string;
    modalBottleSubtitleMulti: (count: number) => string;
    modalBottleSubtitleSingle: string;
    modalBottleBadgeMulti: (count: number) => string;
    modalBottleBadgeSingle: string;
    modalFaceHistoryHeading: (code: string, surface: string) => string;
    modalBottleHistoryHeading: string;
    modalFaceHistorySub: (label: string, surface: string) => string;
    modalBottleHistorySub: (modelName: string) => string;
    modalFaceHistoryEmpty: (label: string, surface: string) => string;
    modalBottleHistoryEmpty: (modelName: string) => string;
    modalRemoveFace: (code: string) => string;
    modalResetTrayLabel: string;
  };
};

export const VI_STUDIO_MESSAGES: StudioMessages = {
  skipToStudio: "Đi tới vùng thiết kế",
  eyebrowBeverage: "THIẾT KẾ NHÃN CHAI · HIỂN THỊ 3D CHÂN THỰC",
  eyebrowPackaging: "THIẾT KẾ BAO BÌ HỘP & KHAY CAD CHUẨN MM",
  heroBeverageLead: "Thiết kế của bạn.",
  heroBeverageAccent: " Sống động như thật.",
  heroPackagingLead: "Hộp & khay tùy chỉnh.",
  heroPackagingAccent: " Gập mở 3D thật.",
  exploreStudio: "Hướng dẫn nhanh",
  domains: {
    beverage: "Chai & Lon",
    packaging: "Hộp & Khay",
    apparel: "Thời trang",
    soon: "SẮP RA",
  },
  actions: {
    restoreDefaults: "Khôi phục mặc định",
    restoreDefaultsTitle: "Khôi phục cảnh mặc định",
    saveProject: "Lưu dự án",
    saveProjectTitle: "Lưu sản phẩm vào dự án để dùng lại hoặc chia sẻ 3D",
  },
  rail: {
    models: "Mẫu 3D",
    templates: "Kiểu hộp",
    label: "Nhãn",
    liquid: "Nước",
    cap: "Nắp",
    top: "Nắp lon",
    bottle: "Thân chai",
    body: "Thân lon",
    scene: "Cảnh",
    sizeSpec: "Kích thước",
    packBottles: "Thêm SP",
    material: "Chất liệu",
    structure: "Cấu trúc",
    proCad: "Pro CAD",
    design: "Artwork",
    headingPackBottles: "Thêm sản phẩm vào hộp/khay",
    headingBoardMaterial: "Giấy & Hiệu ứng in",
    headingStructure: "Cấu trúc & Cắt bế",
    headingProCad: "Thông số kỹ thuật CAD",
    headingBoxDesign: "Thiết kế mặt hộp",
    headingTopTab: "Nắp & Khoen lon",
    headingCanBody: "Thân lon nhôm",
    headingSizeSpec: (code) => `Kích thước · ${code}`,
  },
  library: {
    modelLibrary: "Thư viện mẫu 3D",
    boxTemplates: "Mẫu hộp & khay",
    searchPackaging: "Tìm chai, lon...",
    searchTemplates: "Tìm mã FEFCO / hộp...",
    filterCategory: "Lọc loại hộp",
    filterModels: "Lọc loại mẫu",
    resetFilter: "Đặt lại",
    honeycombDividers: "Đóng vách tổ ong",
    honeycombCells: (count) => `${count} ô`,
    catAll: "Tất cả",
    catGlass: "Thủy tinh",
    catCans: "Lon nhôm",
    catPet: "PET",
    catPp: "PP",
    catTrays: "Khay",
    catCarriers: "Quai xách",
    catRigid: "Hộp cứng",
    catCartons: "Thùng",
    catMailers: "Hộp ship",
    catRetail: "Hộp bán lẻ",
    kindGlass: "Chai thủy tinh",
    kindCan: "Lon nhôm",
    kindPet: "Chai PET",
    kindPp: "Chai PP",
    noModels: "Không tìm thấy mẫu phù hợp.",
    clearFilters: "Xóa bộ lọc",
    pageOf: (page, total) => `Trang ${page} / ${total}`,
    comingSoon: "Sắp có",
  },
  viewport: {
    animated: "Tự xoay",
    reset: "Đặt lại",
    zoomIn: "Phóng to",
    zoomOut: "Thu nhỏ",
    fullscreen: "Toàn màn hình",
    scene1Title: "Cảnh 1 · Nền trưng bày",
    scene2Title: "Cảnh 2 · Nền studio trắng",
    styleWhite: "Trắng",
    stylePink: "Hồng",
    styleDark: "Dark",
    styleToggleToPink: "Phong cách Trắng · Bấm để chuyển sang Hồng",
    styleToggleToWhite: "Phong cách Dark · Bấm để chuyển sang Trắng",
    styleToggleToDark: "Phong cách Hồng · Bấm để chuyển sang Dark",
    graphicsQuality: "Chất lượng đồ họa 3D",
    qualityAuto: (tier) => (tier ? `Tự động (${tier})` : "Tự động"),
    qualityLow: "Thấp",
    qualityMedium: "Trung bình",
    qualityHigh: "Cao",
    qualityUltra: "Siêu nét",
    qualityDescAuto: "Tự động cân chỉnh theo GPU và độ phức tạp mô hình.",
    qualityDescLow: "Nhẹ máy, tiết kiệm pin cho máy cấu hình cũ.",
    qualityDescMedium: "Cân bằng mượt mà và sắc nét khi dừng xoay.",
    qualityDescHigh: "Độ sắc nét cao + khử răng cưa 4× MSAA khi đứng yên.",
    qualityDescUltra: "Độ nét tối đa Retina + 4× MSAA + 8 lần khúc xạ quang học.",
    hoverOutside: "Mặt ngoài",
    hoverInside: "Mặt trong",
    hoverLabel: "Nhãn chai",
    hoverClickReplace: "· Bấm để thay thiết kế",
    hoverClickReplaceAll: (count) => `· Bấm để thay nhãn cả ${count} chai`,
    camIso: "3/4",
    camFront: "Mặt trước",
    camTop: "Từ trên",
    camSide: "Mặt bên",
    camInside: "Bên trong",
    foldOpen: "Mở phẳng",
    foldClose: "Đóng hộp",
    viewSplit: "Chia đôi",
    faces: "Mặt hộp",
    viewLabel: (index) => `Góc ${index}`,
  },
  scenePanel: {
    bgAndEnv: "Nền & Môi trường",
    whiteStudio: "Studio Trắng",
    whiteStudioSub: "Sàn trắng · Lưới phối cảnh · Đổ bóng mềm",
    bgColor: "Màu nền",
    envLighting: "Ánh sáng HDRI",
    envLightingHint: "Tối ưu phản chiếu cho kim loại, thủy tinh & bao bì.",
    envPresets: {
      "studio-original": {
        label: "Studio gốc",
        detail: "HDRI softbox chuẩn mặc định với phản chiếu sắc nét trên thân lon và chai",
      },
      "studio-bright": {
        label: "Studio sáng",
        detail: "Lều sáng khuếch tán đều từ trên cao, giúp nắp nhôm sáng bạc sắc nét",
      },
      "softbox-contrast": {
        label: "Softbox nổi",
        detail: "Đèn thanh dọc tương phản cao kiểu quảng cáo đồ uống chuyên nghiệp",
      },
      "daylight-window": {
        label: "Cửa sổ sáng",
        detail: "Ánh sáng cửa sổ ban ngày kết hợp phản xạ tường kem ấm tự nhiên",
      },
      "nature-garden": {
        label: "Thiên nhiên",
        detail: "Ánh sáng trời tự nhiên ngoài vườn thoáng mát, điểm bóng tán lá nhẹ",
      },
      "cool-minimal": {
        label: "Tối giản mát",
        detail: "Giếng trời kính mờ tông trắng mát sạch sẽ phong cách Bắc Âu",
      },
    },
    spotLight: "Đèn chiếu điểm (Spotlight)",
    spotLightHint: "Chiếu sáng tập trung lên nắp kim loại, viền lon hoặc mặt nhãn.",
    spotPresetTop: "Trên cao",
    spotPresetHero: "Chếch 45°",
    spotPresetRim: "Viền sau",
    spotIntensity: "Độ sáng đèn",
    spotAngle: "Góc xoay ngang",
    spotHeight: "Độ cao đèn",
    spotColor: "Tông ánh sáng",
    spotColors: {
      white: "Trắng chuẩn",
      warm: "Ấm dịu",
      cool: "Mát trong",
      rose: "Hồng studio",
    },
    animatedGrid: "Lưới chuyển động",
    productHighlight: "Ánh sáng nổi bật",
    motion: "Chuyển động",
    motionWebsite: "Trưng bày",
    motionWebsiteSub: "Nghiêng & xoay nhẹ",
    motionIdle: "Đứng yên",
    motionIdleSub: "Cố định góc",
  },
  properties: {
    artworkOffset: "Xoay vị trí nhãn",
    artworkOffsetHint: "Trượt nhãn quanh thân chai. 0% là vị trí gốc.",
    liquidAppearance: "Quang học chất lỏng",
    topAndTab: "Nắp & Khoen bật",
    capFinish: "Chất liệu nắp",
    surfaceFinish: "Chất liệu thân",
    labelFinish: "Chất liệu nhãn in",
    textureReflection: "Độ bóng và phản xạ bề mặt nhãn.",
    fineTuneLight: "Tinh chỉnh độ phản chiếu ánh sáng.",
    restoreModelDefaults: "Khôi phục mặc định mẫu",
    liquidType: "Loại chất lỏng",
    colorPresets: "Bảng màu gợi ý",
    custom: "Tùy chỉnh",
    liquidColor: "Màu nước",
    clarity: "Độ trong suốt",
    density: "Độ đậm đặc",
    turbidity: "Độ đục",
    brightness: "Độ sáng",
    sparkling: "Bọt khí ga",
    fineTune: (name) => `Tinh chỉnh ${name.toLowerCase()}`,
    ior: "Chiết suất (IOR)",
    scattering: "Tán xạ ánh sáng",
    liquidRoughness: "Độ mờ bề mặt nước",
    capColor: "Màu nắp",
    topColor: "Màu nắp lon",
    bodyColor: "Màu thân",
    metallic: "Ánh kim",
    roughness: "Độ nhám",
    helpCap: "Giảm độ nhám để bóng loáng; tăng lên để mịn lì.",
    helpBody: "Tăng ánh kim để phản chiếu mạnh, tăng độ nhám để mịn mờ.",
    helpLabel: "Chọn cách bề mặt nhãn in phản chiếu ánh sáng.",
    addArtwork: "Tải lên nhãn của bạn",
    savedLabelHistory: "Nhãn đã lưu cho mẫu này",
    clearLabel: "Xóa nhãn hiện tại",
    artworkEditorSubtitle: "Căn chỉnh thiết kế vừa khít khuôn nhãn. Bấm trực tiếp lên nhãn 3D để sửa bất cứ lúc nào.",
    savedSubheading: (name) => `Lịch sử nhãn riêng cho ${name}.`,
    savedEmptyText: (name) => `Các nhãn đã lưu cho ${name} sẽ hiển thị tại đây, tách biệt hoàn toàn với các mẫu khác.`,
  },
  render: {
    heading: "Xuất ảnh Render",
    loadingPreview: "Đang tải xem trước…",
    aspectRatio: "Tỷ lệ khung hình",
    resolution: "Độ phân giải",
    frameSquare: "1:1 · Vuông",
    framePortrait: "4:5 · Dọc",
    frameLandscape: "16:9 · Ngang",
    frameStory: "9:16 · Story",
    isTransparent: "Tách nền trong suốt",
    rendering: "Đang xuất ảnh…",
    renderButton: "Xuất ảnh PNG",
    preparingImage: "Đang chuẩn bị dữ liệu…",
    renderingPct: (pct) => `Đang render ${pct}%`,
    downloadImage: "Tải ảnh xuống",
    dielineTitle: "Tải khuôn bế Dieline 1:1 mm",
    dielineSub: "Chuẩn 1:1 mm đường Cắt, Cấn & Tràn lề",
    free: "Miễn phí",
  },
  projectsModal: {
    eyebrow: "HYPERMOCKUP STUDIO",
    title: "Dự án của bạn",
    subtitle: "Gom nhiều hương chai/lon và thùng/khay vào cùng 1 dự án để mở lại nhanh hoặc chia sẻ link duyệt 3D tương tác.",
    searchPlaceholder: "Tìm theo tên dự án hoặc hương vị…",
    countSummary: (projectsCount, itemsCount) => `${projectsCount} dự án · ${itemsCount} sản phẩm`,
    share3d: "Chia sẻ 3D",
    manageLink: "Quản lý link",
    open: "Mở",
    viewItems: (count) => `${count} sản phẩm`,
    hideItems: "Thu gọn",
    deleteProject: "Xóa dự án",
    deleteItem: "Xóa mục này",
    sharedBadge: (views) => `Đang chia sẻ · ${views} lượt xem`,
    pausedBadge: "Đã tạm dừng",
    bottlesUnit: (count) => `${count} chai/lon`,
    boxesUnit: (count) => `${count} hộp/khay`,
    customLabel: "Có nhãn riêng",
    emptyTitle: "Chưa có dự án nào được lưu",
    emptyBody: "Thiết kế xong một chai, lon hoặc hộp rồi bấm Lưu dự án để lưu Cloud 30 ngày, mở lại mọi thiết bị và chia sẻ link 3D.",
    noSearchMatch: "Không tìm thấy dự án phù hợp với từ khóa của bạn.",
    backToStudio: "Quay lại Studio",
    closeAria: "Đóng hộp thoại dự án",
    filterAll: "Tất cả",
    filterShared: "Đang chia sẻ 3D",
    filterExpiring: "Sắp hết hạn",
    cloudQuota: (used, max) => `Cloud · ${used}/${max} dự án`,
    retentionRuleChip: (days, cost) =>
      cost > 0 ? `Lưu ${days} ngày · +${days} ngày / ${cost} coin` : `Lưu ${days} ngày · Gia hạn miễn phí`,
    daysLeft: (days) => `Còn ${days} ngày`,
    expiresToday: "Hết hạn hôm nay",
    autoRenewLabel: "Tự gia hạn",
    autoRenewTooltip: (cost) => `Tự động trừ ${cost} coin để gia hạn thêm 30 ngày khi dự án đến hạn`,
    extendBtn: (days, cost) => `+${days} ngày · ${cost} coin`,
    extendFreeBtn: (days) => `+${days} ngày · Miễn phí`,
    extending: "Đang gia hạn…",
    localOnlyBadge: "Chỉ ở máy này",
    syncToCloud: "Lưu lên Cloud (30 ngày)",
    syncingCloud: "Đang tải lên Cloud…",
    guestBannerTitle: "Đăng nhập để lưu dự án lên Cloud 30 ngày",
    guestBannerBody: "Đồng bộ toàn bộ mẫu chai, hộp và nhãn WebP ≤ 2048px theo tài khoản trên mọi máy tính.",
    signInBtn: "Đăng nhập",
    backToAllProjects: "Tất cả dự án",
    openInStudio: "Mở trong Studio",
    confirmDelete: "Xác nhận xóa?",
    cancelDelete: "Hủy",
    loadingItem: "Đang tải…",
    emptyFilterMatch: "Không có dự án nào trong mục lọc này.",
  },
  saveDialog: {
    eyebrowBeverage: "SẢN PHẨM CHAI / LON 3D",
    eyebrowPackaging: "SẢN PHẨM HỘP / KHAY CAD",
    title: "Lưu vào dự án",
    projectCollectionLabel: "Thuộc dự án (sẽ được lưu chung & chia sẻ trong 1 link 3D)",
    createNewCollection: "+ Tạo dự án mới…",
    newProjectName: "Tên dự án mới",
    newProjectPlaceholder: "VD: Bộ sưu tập Vinut Hạt É 290ml",
    flavorItemLabel: "Tên hương / biến thể sản phẩm",
    boxItemLabel: "Tên hộp / khay",
    flavorPlaceholder: "VD: Hương Dâu · Hương Xoài · Hương Vải",
    boxPlaceholder: "VD: Khay trưng bày 6 chai · Thùng 24 chai",
    saveAsNewItem: "Lưu thành mục mới",
    updateItem: (name) => `Cập nhật "${name}"`,
    itemsUnit: (count) => `${count} sản phẩm`,
    usingDefaultLabel: "Đang dùng nhãn mặc định của mẫu",
    customLabelIncluded: "Đã đính kèm nhãn thiết kế riêng",
    noticeBeverageTitle: "Sẵn sàng chia sẻ & Xếp khay:",
    noticeBeverageBody: "Lưu nhiều mẫu cùng khay/thùng vào 1 dự án để chia sẻ link 3D 1 lần, hoặc vào Hộp & Khay → Thêm SP để xếp sản phẩm này vào hộp/khay.",
    noticePackagingTitle: "Lưu trọn vẹn thiết kế hộp & chai bên trong:",
    noticePackagingBody: "Toàn bộ hình in từng mặt hộp, hiệu ứng ép kim/UV và chai xếp bên trong đều được lưu đầy đủ để chia sẻ 3D.",
    cloudRetentionTitle: (days) => `Lưu Cloud theo tài khoản (${days} ngày):`,
    cloudRetentionBody: (cost) =>
      `Ảnh nhãn tải lên Cloud tự động tối ưu sang WebP ≤ 2048 px. Sau 30 ngày dự án tự xóa nếu không gia hạn (+30 ngày chỉ ${cost} coin).`,
    autoRenewCheckbox: (cost) => `Tự động gia hạn +30 ngày khi hết hạn (${cost} coin/lần)`,
    guestSaveNotice: "Bạn chưa đăng nhập — dự án sẽ chỉ lưu tạm trên trình duyệt này. Đăng nhập để đồng bộ Cloud 30 ngày.",
    cancel: "Hủy",
    save: "Lưu dự án",
    saving: "Đang lưu…",
    errItemNameRequired: "Vui lòng nhập tên sản phẩm.",
    errGroupNameRequired: "Vui lòng nhập tên dự án mới.",
  },
  shareDialog: {
    eyebrow: "CHIA SẺ LINK 3D TƯƠNG TÁC",
    title: (name) => `Chia sẻ "${name}"`,
    liveLink: "Link đang hoạt động",
    pausedLink: "Đang tạm dừng",
    viewsCount: (count) => `${count} lượt xem`,
    passcodeOn: "Có mật khẩu",
    copy: "Sao chép",
    copied: "Đã chép",
    openPreview: "Mở trang xem 3D",
    pauseLink: "Tạm dừng link",
    resumeLink: "Mở lại link",
    revokeDelete: "Thu hồi & xóa",
    includedObjects: (selected, total) => `Sản phẩm đưa vào link (${selected}/${total})`,
    includedHint: "Người xem có thể chuyển đổi qua lại tất cả mẫu chai/lon & hộp/khay đã chọn.",
    defaultView: "Mở đầu tiên",
    boxTrayLabel: "Hộp / Khay CAD",
    reviewTitle: "Tiêu đề trang chia sẻ",
    reviewTitlePlaceholder: "VD: Bộ sưu tập Hạt É 290ml v2",
    brandStudio: "Thương hiệu / Studio (tùy chọn)",
    brandPlaceholder: "VD: Vinut Design Studio",
    clientNote: "Ghi chú cho người xem (tùy chọn)",
    clientNotePlaceholder: "VD: Kéo xoay xem chai 3D và kéo thanh gập mở nắp khay 6 chai.",
    linkExpiry: "Thời hạn link",
    exp7d: "7 ngày",
    exp30d: "30 ngày (Khuyên dùng)",
    exp90d: "90 ngày",
    expNever: "Không hết hạn",
    accessProtection: "Bảo mật truy cập",
    requirePasscode: "Yêu cầu mật khẩu khi mở link",
    newPasscodeHint: "Mật khẩu mới (để trống nếu giữ nguyên)",
    passcodeHint: "Mật khẩu truy cập (4–32 ký tự)",
    passcodePlaceholderUnchanged: "•••••••• (giữ nguyên)",
    passcodePlaceholderNew: "Nhập mật khẩu gửi cho khách",
    allowFold: "Cho kéo mở/đóng hộp CAD",
    allowDimensions: "Cho xem kích thước mm",
    allowBgSwitch: "Cho đổi nền xem",
    costFreeUpdate: "Cập nhật nội dung trên link đã tạo hoàn toàn miễn phí (0 coin) và giữ nguyên đường link cũ.",
    costNewPaid: (coins) => `Tạo link chia sẻ 3D mới tốn ${coins} coin · Cập nhật sau này miễn phí.`,
    costNewFree: "Tạo link chia sẻ 3D hiện đang miễn phí.",
    close: "Đóng",
    publishing: "Đang tạo link…",
    syncUpdates: "Cập nhật lên link",
    createLinkPaid: (coins) => `Tạo link chia sẻ · ${coins} coin`,
    createLinkFree: "Tạo link chia sẻ 3D",
    optimizingArtwork: (done, total) => `Đang tối ưu ảnh nhãn (${done}/${total})…`,
    compressingArtwork: (done, total) => `Đang nén dữ liệu ảnh 3D (${done}/${total})…`,
    uploadingAssets: (count, size) => `Đang tải lên ${count} tệp ảnh (${size})…`,
    closeAria: "Đóng hộp thoại chia sẻ",
    errCopyFailed: "Không thể tự động sao chép. Vui lòng bôi đen và copy đường link thủ công.",
    errTitleRequired: "Vui lòng nhập tiêu đề cho link chia sẻ.",
    errSelectOne: "Vui lòng chọn ít nhất 1 sản phẩm để đưa vào link chia sẻ 3D.",
    errPasscodeLength: (min, max) => `Mật khẩu phải dài từ ${min}–${max} ký tự.`,
    errInsufficientCoins: (coins) => `Bạn cần ${coins} coin để tạo link chia sẻ 3D mới.`,
    errShareLimitReached: (max) => `Bạn đã đạt giới hạn tối đa ${max} link chia sẻ đang hoạt động. Vui lòng xóa bớt link cũ.`,
    errPayloadTooLarge: "Tổng dung lượng ảnh nhãn vượt quá 12 MB. Vui lòng bỏ bớt sản phẩm trong link.",
    errPublishFailed: "Không thể tạo link chia sẻ 3D. Vui lòng thử lại.",
    errUpdateStatusFailed: "Không thể cập nhật trạng thái link chia sẻ.",
    errRevokeFailed: "Không thể thu hồi link chia sẻ này.",
  },
  guide: {
    title: "Làm quen với HyperMockup.",
    steps: [
      { title: "1. Chọn mẫu bao bì", body: "Chọn chai thủy tinh, lon nhôm, chai PET hoặc chuyển sang Hộp & Khay CAD chuẩn mm." },
      { title: "2. Tải lên thiết kế nhãn", body: "Bấm trực tiếp lên nhãn trên mô hình 3D hoặc mở tab Nhãn để căn chỉnh đúng khuôn bế." },
      { title: "3. Tùy chỉnh chất lỏng & ánh sáng", body: "Đổi màu nước, độ trong, nắp chai, hiệu ứng ép kim/UV và góc máy." },
      { title: "4. Xuất PNG 8K hoặc Chia sẻ link 3D", body: "Render ảnh sắc nét tách nền hoặc lưu vào Dự án để gửi link 3D tương tác cho khách duyệt." },
    ],
  },
  toasts: {
    savedItem: (itemName, groupName) => `Đã lưu "${itemName}" vào dự án "${groupName}". Mở Dự án của tôi → Chia sẻ 3D để gửi khách duyệt.`,
    deletedName: (name) => `Đã xóa "${name}".`,
    deletedProject: (name) => `Đã xóa dự án "${name}".`,
    loadedName: (name) => `Đã mở "${name}".`,
    imageReady: "Ảnh đã sẵn sàng. Bấm Tải ảnh xuống để lưu file PNG.",
    signInRender: (coins, resolution) => `Vui lòng đăng nhập để xuất ảnh (${coins} coin ở mức ${resolution} px).`,
    signInRenderFree: "Vui lòng đăng nhập trước khi xuất ảnh.",
    needCoinsRender: (coins, resolution) => `Bạn cần ${coins} coin để xuất ảnh ở mức ${resolution} px.`,
    renderChargeFailed: "Không thể khởi tạo giao dịch xuất ảnh. Vui lòng thử lại.",
    renderFailed: "Xuất ảnh thất bại. Vui lòng thử lại.",
    fullscreenUnavailable: "Trình duyệt này không hỗ trợ chế độ toàn màn hình.",
    defaultRestored: "Đã khôi phục cảnh mặc định.",
    restoredTemplateDefaults: (code) => `Đã khôi phục thông số mặc định cho ${code}.`,
    clearedBoxArtworks: "Đã xóa toàn bộ hình in trên các mặt hộp.",
    apparelComingSoon: "Studio Thời trang đang được phát triển — sẽ sớm ra mắt!",
    dielineSignInPaid: (coins) => `Vui lòng đăng nhập để xuất file khuôn bế 1:1 mm (${coins} coin).`,
    dielineSignInFree: "Vui lòng đăng nhập để xuất file khuôn bế 1:1 mm.",
    dielineNeedCoins: (coins, fmt) => `Bạn cần ${coins} coin để xuất khuôn bế ${fmt} chuẩn 1:1 mm.`,
    dielineStartFailed: "Không thể khởi tạo xuất khuôn bế. Vui lòng thử lại.",
    dielineFailed: "Xuất khuôn bế thất bại. Vui lòng thử lại.",
    dielineDownloaded: (fmt, width, height, coins) =>
      `Đã tải khuôn bế ${fmt} 1:1 mm (${width}×${height} mm)${coins > 0 ? ` · −${coins} coin` : ""}.`,
    shareLivePaid: (coins) => `Link duyệt 3D đã sẵn sàng (−${coins} coin). Sao chép và gửi ngay cho khách hàng!`,
    shareUpdated: "Đã đồng bộ cập nhật mới lên link duyệt 3D.",
    shareRevoked: "Đã thu hồi và xóa link chia sẻ 3D.",
    signInSharePaid: (coins) => `Vui lòng đăng nhập để tạo link duyệt 3D (${coins} coin).`,
    signInShareFree: "Vui lòng đăng nhập để tạo link duyệt 3D.",
    savedCloudItem: (itemName, groupName) => `Đã lưu "${itemName}" vào dự án Cloud "${groupName}" (lưu 30 ngày · WebP ≤ 2048px).`,
    extendedProject: (name, days, coins) =>
      coins > 0
        ? `Đã gia hạn dự án "${name}" thêm ${days} ngày (−${coins} coin).`
        : `Đã gia hạn dự án "${name}" thêm ${days} ngày.`,
    autoRenewEnabled: (name, cost) => `Đã bật tự động gia hạn cho "${name}" (${cost} coin / 30 ngày).`,
    autoRenewDisabled: (name) => `Đã tắt tự động gia hạn cho "${name}".`,
    migratedToCloud: (name) => `Đã đồng bộ dự án "${name}" lên tài khoản Cloud (lưu 30 ngày).`,
    needCoinsExtend: (coins) => `Bạn cần ít nhất ${coins} coin để gia hạn dự án thêm 30 ngày.`,
    projectLimitReached: (max) => `Tài khoản đã đạt giới hạn tối đa ${max} dự án Cloud. Vui lòng xóa bớt dự án cũ.`,
    cloudActionFailed: "Không thể đồng bộ với Cloud. Vui lòng thử lại.",
  },
  packaging: {
    dimensionsTitle: "Cỡ (mm)",
    inner: "Trong",
    outer: "Ngoài",
    innerTitle: "Kích thước lọt lòng bên trong hộp",
    outerTitle: "Kích thước phủ bì bên ngoài hộp",
    resetParamsTitle: "Đặt lại kích thước & chất liệu mặc định",
    length: "Chiều dài",
    width: "Chiều rộng",
    height: "Chiều cao",
    oppositeSize: (mode) => (mode === "inner" ? "Kích thước phủ bì" : "Kích thước lọt lòng"),
    blankAndWeight: "Phôi phẳng · Trọng lượng ước tính",
    fitBadge: "Vừa",
    packTitle: "Thêm sản phẩm",
    packComboBadge: "Combo",
    packIntro: (shortName) =>
      `Đặt trực tiếp sản phẩm 3D (chai, lon, lọ...) kèm nhãn riêng vào bên trong mẫu ${shortName} này và tự động căn kích thước chuẩn mm.`,
    myProjectsTab: (count) => `Dự án của tôi (${count})`,
    catalogTab: "Thư viện",
    customLabelTag: "Nhãn riêng",
    customizeNewBottle: "Tùy chỉnh chai mới ở mục Chai & Lon",
    noCustomProjectsLead: "Chưa có dự án tùy chỉnh nào. Hãy thiết kế chai/lon ở mục ",
    noCustomProjectsHighlight1: "Chai & Lon",
    noCustomProjectsMid: ", bấm ",
    noCustomProjectsHighlight2: "Lưu dự án",
    noCustomProjectsTail: " rồi chọn ngay tại đây!",
    goCustomizeBottle: "Đi tới mục Chai & Lon",
    myCustomProjectsGroup: "★ Dự án của tôi",
    groupCans: "Lon nhôm",
    groupGlass: "Chai thủy tinh",
    groupPet: "Chai PET",
    groupPp: "Chai PP",
    customTag: (name) => `Dự án: ${name}`,
    activeTag: (name) => `Đang dùng: ${name}`,
    labelSyncedTag: "Đã đồng bộ nhãn",
    activeStudioModelTag: "Mẫu đang mở ở Studio",
    replaceAllLabels: (count) => `Đổi nhãn (cả ${count} SP)`,
    replaceAllLabelsTitle: "Bấm trực tiếp vào nhãn sản phẩm 3D hoặc nút này để thay nhãn cho tất cả sản phẩm trong hộp",
    resetShort: "Đặt lại",
    resetLabelTitle: "Khôi phục nhãn mặc định của hộp",
    gridPresetLabel: (cols, rows, defaultLabel) => {
      const n = cols * rows;
      return n >= 4 ? `Lốc ${n}` : defaultLabel;
    },
    colsLabel: "Cột (L)",
    rowsLabel: "Hàng (W)",
    fitCleanly: (count) => `Xếp vừa vặn ${count} sản phẩm bên trong`,
    tightBy: (detail) => `Thiếu ${detail}`,
    packCountUnit: (count) => `${count} SP`,
    autoFitCta: (count, vol) => `Tự căn hộp cho ${count}× ${vol}`,
    bottleSpacing: "Khoảng cách giữa sản phẩm",
    labelFacingAngle: "Góc hướng mặt nhãn",
    autoResizeOnGrid: "Tự chỉnh cỡ hộp khi đổi lưới",
    organicJitter: "Xoay góc ngẫu nhiên tự nhiên",
    rerollAngles: "Đảo lại góc xoay ngẫu nhiên",
    boardMaterialTitle: "Chất liệu giấy & carton",
    outsideLabel: "Mặt ngoài",
    insideLabel: "Mặt trong",
    surfaceFinish: "Độ bóng bề mặt (Bóng ↔ Nhám)",
    printFinishTitle: "Hiệu ứng in",
    printFinishBadge: "UV · Ép kim",
    applyArea: "Vùng áp dụng",
    targetAutoArt: "Tự tách hình",
    targetFrame: "Khung viền",
    targetFull: "Toàn bộ",
    tactileRelief: (dir) =>
      `Độ nổi bề mặt (${dir === "emboss" ? "Thúc nổi ↑" : dir === "deboss" ? "Ép chìm ↓" : "Phẳng"})`,
    finishStrength: "Cường độ hiệu ứng",
    artworkMaskSens: "Độ nhạy tách vùng in",
    invertFinishMask: "Đảo ngược vùng hiệu ứng",
    uploadFinishMask: "Tải mặt nạ đen-trắng UV / Ép kim",
    maskSelected: (name) => `Mặt nạ: ${name}`,
    clearShort: "Xóa",
    finishEmptyHint:
      "Thêm phủ UV định hình, ép kim Vàng 24K / Bạc / Vàng hồng / Holo và thúc nổi hoặc ép chìm sắc nét.",
    finishActiveHint:
      "Dừng xoay để hệ thống tự làm mịn bóng đổ và ánh sáng studio rõ nét hơn.",
    finishPresetLabel: (id, fallback) => {
      const map: Record<string, string> = {
        none: "Không",
        "spot-uv": "Phủ UV",
        "gold-foil": "Ép Vàng",
        "silver-foil": "Ép Bạc",
        "rose-gold-foil": "Vàng hồng",
        "copper-foil": "Ép Đồng",
        "black-foil": "Ép Đen",
        "holo-foil": "Ép Holo",
      };
      return map[id] ?? fallback;
    },
    structureTitle: "Cấu trúc & Cắt bế",
    carrierPackLayout: "Kiểu chia ô quai xách",
    carrierPackBtn: (layout) => (layout === "4-pack" ? "4 ô" : layout === "6-pack" ? "6 ô" : "8 ô"),
    internalDividers: "Vách ngăn chia ô bên trong",
    lidSkirtDepth: "Chiều sâu thành nắp chụp",
    lockTabsPerSide: "Số tai khóa mỗi bên",
    oneTab: "1 Tai",
    twoTabs: "2 Tai",
    lockTabWidth: "Chiều rộng tai khóa",
    tuckStyle: "Kiểu nắp gài",
    tuckReverse: "Đảo chiều",
    tuckStraight: "Cùng chiều",
    tuckFlapLength: "Chiều dài lưỡi gài",
    sideFlapGap: "Khe hở nắp hông",
    topBottomFlapGap: "Khe hở nắp trên & đáy",
    dustFlapTaper: "Độ vát tai chắn bụi",
    thumbNotch: "Khuyết ngón tay mở nắp",
    frontDisplayScoop: "Khoét vòm trưng bày mặt trước",
    scoopDepth: "Độ sâu khoét vòm",
    carryHandHoles: "Lỗ tay xách",
    sideHandHoles: "Lỗ tay xách hai hông",
    handleWidth: "Chiều rộng tay xách",
    windowCutout: "Cửa sổ trưng bày trong suốt",
    windowWidth: "Chiều rộng cửa sổ",
    windowHeight: "Chiều cao cửa sổ",
    windowFilm: "Màng kính PET trong suốt",
    proCadTitle: "Chế độ CAD",
    proCadBadge: "Pro",
    boardCaliper: "Độ dày giấy chính xác (t)",
    fluteDirection: "Hướng sóng carton",
    alongL: "Dọc L",
    alongW: "Dọc W",
    lockFoldClearance: "Khe hở gập & khóa",
    printBleedMargin: "Lề tràn in (Bleed)",
    showCreaseGuidelines: "Hiện đường cấn gập",
    netSheetArea: "Diện tích phôi ròng",
    panelsAndCreases: "Số mặt / Nếp gấp",
    panelsFoldsValue: (panels, folds) => `${panels} mặt · ${folds} nếp`,
    artworkTipLead: "Bấm trực tiếp vào mặt hộp 3D ",
    artworkTipBody: "để chỉnh thiết kế ngay. Mỗi mặt có hình ảnh và lịch sử lưu riêng biệt.",
    printSide: "Mặt in",
    boxFacesTitle: (side) => `Các mặt hộp (${side === "outside" ? "Mặt ngoài" : "Mặt trong"})`,
    faceCount: (count) => `${count} mặt`,
    faceCustom: "Tùy chỉnh",
    faceEmpty: "Trống",
    btnAdd: "Thêm",
    btnReplace: "Đổi ảnh",
    uploadFaceArt: (code) => `Tải thiết kế cho mặt ${code}`,
    replaceFaceArt: (code) => `Sửa / Đổi thiết kế mặt ${code}`,
    faceTint: "Màu nền mặt",
    resetTint: "Xóa màu",
    removeFaceArt: (code) => `Xóa ảnh khỏi mặt ${code}`,
    quickTextOn: (code) => `Chữ nhanh trên mặt ${code}`,
    textPlaceholder: (code) => `VD: HYPERMOCKUP · ${code}`,
    textColor: "Màu chữ",
    textSize: "Cỡ chữ",
    clearAllFaces: "Xóa thiết kế tất cả mặt hộp",
    faceLabel: (englishLabel) => {
      const map: Record<string, string> = {
        "Base Panel": "Mặt đáy",
        "Bottom Panel": "Mặt đáy",
        "Carrier Base": "Đáy quai xách",
        "Inner Drawer Base": "Đáy ngăn kéo",
        "Front Panel": "Mặt trước",
        "Front Wall": "Mặt trước",
        "Front Display Wall": "Mặt trưng bày trước",
        "Front Tray Wall": "Thành khay trước",
        "Base Front Wall": "Thành đáy trước",
        "Back Panel": "Mặt sau",
        "Back Wall": "Mặt sau",
        "Back Display Wall": "Mặt trưng bày sau",
        "Back Spine Wall": "Thành gáy sau",
        "Book Spine Back Wall": "Thành gáy sau",
        "Base Back Wall": "Thành đáy sau",
        "Left Side Panel": "Mặt hông trái",
        "Left Side Wall": "Thành hông trái",
        "Left Wall": "Mặt hông trái",
        "Left End Wall": "Thành đầu trái",
        "Base Left Wall": "Thành đáy trái",
        "Right Side Panel": "Mặt hông phải",
        "Right Side Wall": "Thành hông phải",
        "Right Wall": "Mặt hông phải",
        "Right End Wall": "Thành đầu phải",
        "Base Right Wall": "Thành đáy phải",
        "Top Panel": "Mặt nắp trên",
        "Top Lid": "Mặt nắp trên",
        "Top Lid Roof": "Mặt trên nắp chụp",
        "Book Cover Lid": "Mặt nắp mở sách",
        "Top Tuck Flap": "Lưỡi gài trên",
        "Bottom Tuck Flap": "Lưỡi gài đáy",
        "Lid Front Tuck": "Nắp gài trước",
        "Lid Front Skirt": "Thành nắp trước",
        "Lid Back Skirt": "Thành nắp sau",
        "Lid Left Skirt": "Thành nắp trái",
        "Lid Right Skirt": "Thành nắp phải",
        "Top Front Major Flap": "Nắp trên trước",
        "Top Back Major Flap": "Nắp trên sau",
        "Bottom Front Major Flap": "Nắp đáy trước",
        "Bottom Back Major Flap": "Nắp đáy sau",
        "Top Left Minor Flap": "Nắp phụ trên trái",
        "Top Right Minor Flap": "Nắp phụ trên phải",
        "Bottom Left Minor Flap": "Nắp phụ đáy trái",
        "Bottom Right Minor Flap": "Nắp phụ đáy phải",
        "Left Upper Side Flap": "Nắp hông trái (trên)",
        "Left Lower Side Flap": "Nắp hông trái (dưới)",
        "Right Upper Side Flap": "Nắp hông phải (trên)",
        "Right Lower Side Flap": "Nắp hông phải (dưới)",
        "Magnetic Front Flap": "Nắp gập nam châm trước",
        "Magnetic Closure Flap": "Nắp gập nam châm",
        "Sleeve Front Wall": "Mặt trước vỏ trượt",
        "Sleeve Back Wall": "Mặt sau vỏ trượt",
        "Sleeve Top Face": "Mặt trên vỏ trượt",
        "Sleeve Bottom Face": "Mặt đáy vỏ trượt",
        "Outer Sleeve Top": "Mặt trên vỏ trượt",
        "Outer Sleeve Bottom": "Mặt đáy vỏ trượt",
        "Outer Sleeve Back": "Mặt sau vỏ trượt",
        "Outer Sleeve Front": "Mặt trước vỏ trượt",
        "Drawer Base": "Đáy ngăn kéo",
        "Drawer Front Wall": "Thành trước ngăn kéo",
        "Drawer Back Wall": "Thành sau ngăn kéo",
        "Drawer Left Wall": "Thành trái ngăn kéo",
        "Drawer Right Wall": "Thành phải ngăn kéo",
        "Drawer Rear End": "Mặt sau ngăn kéo",
        "Drawer Pull Face": "Mặt kéo ngăn kéo",
        "Center Carry Handle": "Quai xách giữa",
        "Center Handle Spine": "Quai xách trung tâm",
        "Left Top Rim": "Viền mép trên trái",
        "Right Top Rim": "Viền mép trên phải",
        "Left Inner Rollover": "Thành gập trong trái",
        "Right Inner Rollover": "Thành gập trong phải",
        "Left Inner Rollover Wall": "Thành gập trong trái",
        "Right Inner Rollover Wall": "Thành gập trong phải",
      };
      return map[englishLabel] ?? englishLabel;
    },
    dielineBlank: "Phôi",
    dielineCut: "Cắt",
    dielineCrease: "Cấn gập",
    dielineBleed: "Tràn lề",
    modalFaceSubtitle: (label, surface) =>
      `Thiết kế riêng cho ${label} (${surface}) — không ảnh hưởng tới các mặt khác.`,
    modalBottleSubtitleMulti: (count) =>
      `Căn chỉnh nhãn trong khung khuôn bế. Xác nhận sẽ cập nhật đồng bộ cho cả ${count} chai trong hộp.`,
    modalBottleSubtitleSingle: "Căn chỉnh nhãn trong khung khuôn bế để áp lên chai trong hộp.",
    modalBottleBadgeMulti: (count) => `ÁP DỤNG CHO CẢ ${count} CHAI`,
    modalBottleBadgeSingle: "NHÃN CHAI",
    modalFaceHistoryHeading: (code, surface) => `Lịch sử mặt ${code} (${surface})`,
    modalBottleHistoryHeading: "Lịch sử nhãn chai",
    modalFaceHistorySub: (label, surface) => `Lịch sử lưu riêng cho ${label} (${surface}).`,
    modalBottleHistorySub: (modelName) => `Lịch sử nhãn lưu riêng cho mẫu ${modelName}.`,
    modalFaceHistoryEmpty: (label, surface) =>
      `Thiết kế bạn xác nhận cho ${label} (${surface}) sẽ được lưu riêng tại đây.`,
    modalBottleHistoryEmpty: (modelName) =>
      `Nhãn bạn xác nhận cho ${modelName} sẽ được lưu riêng tại đây.`,
    modalRemoveFace: (code) => `Xóa ảnh khỏi mặt ${code}`,
    modalResetTrayLabel: "Đặt lại nhãn chai trong hộp",
  },
};

export const EN_STUDIO_MESSAGES: StudioMessages = {
  skipToStudio: "Skip to studio",
  eyebrowBeverage: "A LITTLE LABEL. A WHOLE NEW WORLD.",
  eyebrowPackaging: "PARAMETRIC MILLIMETRE PACKAGING CAD",
  heroBeverageLead: "Your design.",
  heroBeverageAccent: " Made real.",
  heroPackagingLead: "Custom boxes.",
  heroPackagingAccent: " Folded real.",
  exploreStudio: "Explore the studio",
  domains: {
    beverage: "Bottles & Cans",
    packaging: "Boxes & Trays",
    apparel: "Apparel",
    soon: "SOON",
  },
  actions: {
    restoreDefaults: "Restore defaults",
    restoreDefaultsTitle: "Restore default scene",
    saveProject: "Save project",
    saveProjectTitle: "Save to a project collection to reuse or share in 3D",
  },
  rail: {
    models: "Models",
    templates: "Templates",
    label: "Label",
    liquid: "Liquid",
    cap: "Cap",
    top: "Top",
    bottle: "Bottle",
    body: "Body",
    scene: "Scene",
    sizeSpec: "Size & Spec",
    packBottles: "Add Product",
    material: "Material",
    structure: "Structure",
    proCad: "Pro CAD",
    design: "Artwork",
    headingPackBottles: "Add Products",
    headingBoardMaterial: "Board & Material",
    headingStructure: "Structure & Cutouts",
    headingProCad: "Pro CAD Mode",
    headingBoxDesign: "Box Design",
    headingTopTab: "Top & Tab",
    headingCanBody: "Can Body",
    headingSizeSpec: (code) => `Size & Spec · ${code}`,
  },
  library: {
    modelLibrary: "Model library",
    boxTemplates: "Box templates",
    searchPackaging: "Search packaging...",
    searchTemplates: "Search FEFCO / box...",
    filterCategory: "Filter category",
    filterModels: "Filter category",
    resetFilter: "Reset",
    honeycombDividers: "Honeycomb cell dividers",
    honeycombCells: (count) => `${count} cells`,
    catAll: "All",
    catGlass: "Glass",
    catCans: "Cans",
    catPet: "PET",
    catPp: "PP",
    catTrays: "Trays",
    catCarriers: "Carriers",
    catRigid: "Rigid",
    catCartons: "Cartons",
    catMailers: "Mailers",
    catRetail: "Retail",
    kindGlass: "Glass bottle",
    kindCan: "Alu can",
    kindPet: "PET bottle",
    kindPp: "PP bottle",
    noModels: "No matching models found.",
    clearFilters: "Clear filters",
    pageOf: (page, total) => `Page ${page} / ${total}`,
    comingSoon: "Coming soon",
  },
  viewport: {
    animated: "Animated",
    reset: "Reset",
    zoomIn: "Zoom in",
    zoomOut: "Zoom out",
    fullscreen: "Fullscreen",
    scene1Title: "Scene 1 · Ambient showcase",
    scene2Title: "Scene 2 · White studio floor",
    styleWhite: "White",
    stylePink: "Pink",
    styleDark: "Dark",
    styleToggleToPink: "Style: White · Click to switch to Pink",
    styleToggleToWhite: "Style: Pink · Click to switch to White",
    styleToggleToDark: "Style · Click to switch to Dark",
    graphicsQuality: "Graphics quality",
    qualityAuto: (tier) => (tier ? `Auto (${tier})` : "Auto"),
    qualityLow: "Low",
    qualityMedium: "Medium",
    qualityHigh: "High",
    qualityUltra: "Ultra",
    qualityDescAuto: "Automatically matches your GPU and scales per model complexity.",
    qualityDescLow: "Lightweight interactive rendering with crisp still-frame refinement.",
    qualityDescMedium: "Sharp 4× MSAA on boxes & cans; smooth adaptive scaling on heavy glass.",
    qualityDescHigh: "Full native sharpness & 4× MSAA on boxes, cans & PET; idle-sharp heavy glass.",
    qualityDescUltra: "Full Retina DPR, 4× MSAA, and 8 optical bounces on all models.",
    hoverOutside: "Outside",
    hoverInside: "Inside",
    hoverLabel: "Label",
    hoverClickReplace: "· Click to replace artwork",
    hoverClickReplaceAll: (count) => `· Click to replace all ${count} bottles`,
    camIso: "3/4",
    camFront: "Front",
    camTop: "Top",
    camSide: "Side",
    camInside: "Inside",
    foldOpen: "Open",
    foldClose: "Close",
    viewSplit: "Split",
    faces: "Faces",
    viewLabel: (index) => `View ${index}`,
  },
  scenePanel: {
    bgAndEnv: "Background & environment",
    whiteStudio: "White Studio",
    whiteStudioSub: "White floor · Perspective grid · 20 m fade",
    bgColor: "Background color",
    envLighting: "HDRI lighting",
    envLightingHint: "Lightweight product reflections for metal, glass & packaging.",
    envPresets: {
      "studio-original": {
        label: "Studio Classic",
        detail: "Default softbox HDRI with crisp vertical reflections on bottles & cans",
      },
      "studio-bright": {
        label: "Bright Studio",
        detail: "Overhead silk light-tent for crisp silver can tops and clean commercial look",
      },
      "softbox-contrast": {
        label: "Softbox Pro",
        detail: "High-contrast commercial strip softboxes with overhead silver bounce",
      },
      "daylight-window": {
        label: "Loft Window",
        detail: "Crisp north-facing studio window paired with warm plaster bounce",
      },
      "nature-garden": {
        label: "Natural Garden",
        detail: "Bright outdoor daylight sky with gentle dappled botanical canopy reflections",
      },
      "cool-minimal": {
        label: "Cool Minimal",
        detail: "Ultra-clean Scandinavian frosted glass atrium with cool white skylight",
      },
    },
    spotLight: "Studio Spotlight",
    spotLightHint: "Focused directional beam to lift metallic tops, rims, and hero labels.",
    spotPresetTop: "Top Hero",
    spotPresetHero: "Hero 45°",
    spotPresetRim: "Back Rim",
    spotIntensity: "Brightness",
    spotAngle: "Orbit angle",
    spotHeight: "Light height",
    spotColor: "Light tint",
    spotColors: {
      white: "Neutral white",
      warm: "Warm tungsten",
      cool: "Cool ice",
      rose: "Studio rose",
    },
    animatedGrid: "Animated grid",
    productHighlight: "Product highlight",
    motion: "Motion",
    motionWebsite: "Website",
    motionWebsiteSub: "Tilt & rotate",
    motionIdle: "Idle",
    motionIdleSub: "Still",
  },
  properties: {
    artworkOffset: "Artwork offset",
    artworkOffsetHint: "Slide the artwork around the package. 0% is the original position.",
    liquidAppearance: "Liquid appearance",
    topAndTab: "Top & pull tab",
    capFinish: "Cap finish",
    surfaceFinish: "Surface finish",
    labelFinish: "Label finish",
    textureReflection: "Texture & reflection.",
    fineTuneLight: "Fine-tune the way light feels.",
    restoreModelDefaults: "Restore model defaults",
    liquidType: "Liquid type",
    colorPresets: "Color presets",
    custom: "Custom",
    liquidColor: "Liquid color",
    clarity: "Clarity",
    density: "Density",
    turbidity: "Turbidity",
    brightness: "Brightness",
    sparkling: "Sparkling",
    fineTune: (name) => `Fine-tune ${name.toLowerCase()}`,
    ior: "Refraction (IOR)",
    scattering: "Light scattering",
    liquidRoughness: "Liquid roughness",
    capColor: "Cap color",
    topColor: "Top color",
    bodyColor: "Body color",
    metallic: "Metallic",
    roughness: "Roughness",
    helpCap: "Less roughness gives a polished finish. More adds a soft, matte look.",
    helpBody: "Shape reflections with metallic, then soften them with roughness.",
    helpLabel: "Choose how the printed artwork reflects light.",
    addArtwork: "Add your artwork",
    savedLabelHistory: "Saved label history",
    clearLabel: "Clear label",
    artworkEditorSubtitle: "Position your artwork inside the label dieline. Click any bottle label in 3D to edit anytime.",
    savedSubheading: (name) => `Independent history for ${name} only.`,
    savedEmptyText: (name) => `Labels saved for ${name} will appear here, isolated from other models and box faces.`,
  },
  render: {
    heading: "Render image",
    loadingPreview: "Loading preview…",
    aspectRatio: "Aspect ratio",
    resolution: "Resolution",
    frameSquare: "1:1 · Square",
    framePortrait: "4:5 · Portrait",
    frameLandscape: "16:9 · Landscape",
    frameStory: "9:16 · Story",
    isTransparent: "Is Transparent",
    rendering: "Rendering…",
    renderButton: "Render Image",
    preparingImage: "Preparing image…",
    renderingPct: (pct) => `Rendering ${pct}%`,
    downloadImage: "Download image",
    dielineTitle: "Download 1:1 mm Dieline Vector",
    dielineSub: "True 1:1 mm Cut, Crease & Bleed",
    free: "Free",
  },
  projectsModal: {
    eyebrow: "HYPERMOCKUP STUDIO",
    title: "Your projects",
    subtitle: "Organize multiple bottle flavors, trays & boxes in one project, then share a single interactive 3D review link.",
    searchPlaceholder: "Search projects or flavors…",
    countSummary: (projectsCount, itemsCount) =>
      `${projectsCount} ${projectsCount === 1 ? "project" : "projects"} · ${itemsCount} ${itemsCount === 1 ? "item" : "items"}`,
    share3d: "Share 3D",
    manageLink: "Manage link",
    open: "Open",
    viewItems: (count) => `${count} items`,
    hideItems: "Hide",
    deleteProject: "Delete project",
    deleteItem: "Remove item",
    sharedBadge: (views) => `Live · ${views} ${views === 1 ? "view" : "views"}`,
    pausedBadge: "Paused",
    bottlesUnit: (count) => `${count} ${count === 1 ? "bottle/can" : "bottles/cans"}`,
    boxesUnit: (count) => `${count} ${count === 1 ? "box/tray" : "boxes/trays"}`,
    customLabel: "Custom label",
    emptyTitle: "No saved projects yet",
    emptyBody: "Customize any bottle, can, or box and select Save project to store it on Cloud for 30 days and share interactive 3D links.",
    noSearchMatch: "No projects match your search.",
    backToStudio: "Back to studio",
    closeAria: "Close projects dialog",
    filterAll: "All",
    filterShared: "Shared 3D",
    filterExpiring: "Expiring soon",
    cloudQuota: (used, max) => `Cloud · ${used}/${max} projects`,
    retentionRuleChip: (days, cost) =>
      cost > 0 ? `${days}-day storage · +${days}d / ${cost} coins` : `${days}-day storage · Free extension`,
    daysLeft: (days) => `${days}d left`,
    expiresToday: "Expires today",
    autoRenewLabel: "Auto-renew",
    autoRenewTooltip: (cost) => `Automatically spend ${cost} coins to extend +30 days when expired`,
    extendBtn: (days, cost) => `+${days}d · ${cost} coins`,
    extendFreeBtn: (days) => `+${days}d · Free`,
    extending: "Extending…",
    localOnlyBadge: "Local only",
    syncToCloud: "Save to Cloud (30d)",
    syncingCloud: "Uploading to Cloud…",
    guestBannerTitle: "Sign in to sync projects on Cloud for 30 days",
    guestBannerBody: "Keep all flavors, boxes, and ≤ 2048px WebP artwork synced to your account across devices.",
    signInBtn: "Sign in",
    backToAllProjects: "All projects",
    openInStudio: "Open in Studio",
    confirmDelete: "Delete?",
    cancelDelete: "Cancel",
    loadingItem: "Loading…",
    emptyFilterMatch: "No projects in this filter.",
  },
  saveDialog: {
    eyebrowBeverage: "CUSTOM BOTTLE / CAN ITEM",
    eyebrowPackaging: "PACKAGING CAD ITEM",
    title: "Save to project",
    projectCollectionLabel: "Project collection (saved & shared together in 1 3D link)",
    createNewCollection: "+ Create new project collection…",
    newProjectName: "New project name",
    newProjectPlaceholder: "e.g. Vinut Basil 290ml · Summer Line",
    flavorItemLabel: "Flavor / SKU item name",
    boxItemLabel: "Box / Tray item name",
    flavorPlaceholder: "e.g. Strawberry · Mango · Lychee",
    boxPlaceholder: "e.g. 6-Pack Display Tray · 24-Pack Carton",
    saveAsNewItem: "Save as new item",
    updateItem: (name) => `Update "${name}"`,
    itemsUnit: (count) => `${count} ${count === 1 ? "item" : "items"}`,
    usingDefaultLabel: "Using default model label",
    customLabelIncluded: "Custom label snapshot included",
    noticeBeverageTitle: "Multi-flavor & Pack ready:",
    noticeBeverageBody: "Save multiple products plus trays/boxes into one project to share a single 3D link, or open Boxes & Trays → Add Product to place this product inside a box or tray.",
    noticePackagingTitle: "Full artwork & packed bottles saved:",
    noticePackagingBody: "All box face artworks, print finishes, and packed bottles are snapshotted so clients see the exact 3D box when shared.",
    cloudRetentionTitle: (days) => `Account Cloud Storage (${days} days):`,
    cloudRetentionBody: (cost) =>
      `Uploaded labels are automatically normalized to ≤ 2048 px WebP. Projects auto-delete after 30 days unless extended (+30 days for ${cost} coins).`,
    autoRenewCheckbox: (cost) => `Auto-renew +30 days upon expiry (${cost} coins)`,
    guestSaveNotice: "Not signed in — this project will save locally in this browser only. Sign in for 30-day Cloud sync.",
    cancel: "Cancel",
    save: "Save to project",
    saving: "Saving…",
    errItemNameRequired: "Please enter a name for this product item.",
    errGroupNameRequired: "Please enter a project collection name.",
  },
  shareDialog: {
    eyebrow: "INTERACTIVE 3D SHARE LINK",
    title: (name) => `Share "${name}"`,
    liveLink: "Live link",
    pausedLink: "Paused",
    viewsCount: (count) => `${count} ${count === 1 ? "view" : "views"}`,
    passcodeOn: "Passcode on",
    copy: "Copy",
    copied: "Copied",
    openPreview: "Open 3D view",
    pauseLink: "Pause link",
    resumeLink: "Resume link",
    revokeDelete: "Revoke & delete",
    includedObjects: (selected, total) => `Included 3D objects (${selected}/${total})`,
    includedHint: "Viewers can switch between all checked bottles, cans, trays & boxes.",
    defaultView: "Default view",
    boxTrayLabel: "Box / Tray CAD",
    reviewTitle: "Share title",
    reviewTitlePlaceholder: "e.g. Summer Beverage Line v2",
    brandStudio: "Brand / Studio (optional)",
    brandPlaceholder: "e.g. Vinut Design Studio",
    clientNote: "Note for viewers (optional)",
    clientNotePlaceholder: "e.g. Drag to inspect bottle optics and slide to open the 6-pack tray.",
    linkExpiry: "Link expiry",
    exp7d: "7 days",
    exp30d: "30 days (Recommended)",
    exp90d: "90 days",
    expNever: "No expiration",
    accessProtection: "Access protection",
    requirePasscode: "Require passcode to view",
    newPasscodeHint: "New passcode (leave blank to keep current)",
    passcodeHint: "Passcode (4–32 characters)",
    passcodePlaceholderUnchanged: "•••••••• (unchanged)",
    passcodePlaceholderNew: "Enter client passcode",
    allowFold: "Fold / open CAD boxes",
    allowDimensions: "3D mm dimensions",
    allowBgSwitch: "Switch backdrop",
    costFreeUpdate: "Updating an existing share link is free (0 coins) and keeps the same URL.",
    costNewPaid: (coins) => `Creating a new 3D share link costs ${coins} coins · Updates stay free.`,
    costNewFree: "Creating a 3D share link is currently free.",
    close: "Close",
    publishing: "Publishing…",
    syncUpdates: "Sync link updates",
    createLinkPaid: (coins) => `Create Share Link · ${coins} coins`,
    createLinkFree: "Create Share Link",
    optimizingArtwork: (done, total) => `Optimizing 3D artwork (${done}/${total})…`,
    compressingArtwork: (done, total) => `Compressing 3D artwork (${done}/${total})…`,
    uploadingAssets: (count, size) => `Uploading ${count} assets (${size})…`,
    closeAria: "Close share dialog",
    errCopyFailed: "Could not copy to clipboard automatically. Please select and copy the URL.",
    errTitleRequired: "Please enter a title for your share link.",
    errSelectOne: "Select at least one bottle, can, tray, or box to include in the 3D link.",
    errPasscodeLength: (min, max) => `Passcode must be ${min}–${max} characters.`,
    errInsufficientCoins: (coins) => `You need ${coins} coins to publish a new 3D share link.`,
    errShareLimitReached: (max) => `You reached the maximum of ${max} active share links. Delete an older share first.`,
    errPayloadTooLarge: "Project assets exceed the upload limit (12 MB total). Try fewer items.",
    errPublishFailed: "Could not publish the 3D share link. Please try again.",
    errUpdateStatusFailed: "Could not update share status.",
    errRevokeFailed: "Could not revoke this share link.",
  },
  guide: {
    title: "Meet HyperMockup.",
    steps: [
      { title: "1. Choose a shape", body: "Start with a glass bottle, aluminum can, PET bottle, or switch to Parametric Boxes & Trays." },
      { title: "2. Place your label", body: "Click directly on the 3D label or open the Label panel to fit artwork to the exact dieline." },
      { title: "3. Tune optics & materials", body: "Customize liquid color, clarity, cap metalness, print finishes, and studio lighting." },
      { title: "4. Render 8K or Share 3D link", body: "Export transparent studio PNGs or save into a Project to send an interactive 3D client review link." },
    ],
  },
  toasts: {
    savedItem: (itemName, groupName) => `Saved "${itemName}" into project "${groupName}". Open Your Projects → Share 3D to send a review link.`,
    deletedName: (name) => `Deleted "${name}".`,
    deletedProject: (name) => `Deleted project "${name}".`,
    loadedName: (name) => `Loaded "${name}".`,
    imageReady: "Your image is ready. Select Download image to save the PNG.",
    signInRender: (coins, resolution) => `Please sign in to render (${coins} coins at ${resolution} px).`,
    signInRenderFree: "Please sign in before rendering.",
    needCoinsRender: (coins, resolution) => `You need ${coins} coins to render at ${resolution} px.`,
    renderChargeFailed: "Could not charge the render. Please try again.",
    renderFailed: "Rendering failed. Please try again.",
    fullscreenUnavailable: "Fullscreen is unavailable in this browser.",
    defaultRestored: "Default scene restored.",
    restoredTemplateDefaults: (code) => `Restored ${code} defaults.`,
    clearedBoxArtworks: "Cleared all box face artworks.",
    apparelComingSoon: "Fashion & Apparel Studio is on our roadmap — coming soon!",
    dielineSignInPaid: (coins) => `Please sign in to export 1:1 mm dieline files (${coins} coins).`,
    dielineSignInFree: "Please sign in to export 1:1 mm dieline files.",
    dielineNeedCoins: (coins, fmt) => `You need ${coins} coins to export a 1:1 mm ${fmt} dieline.`,
    dielineStartFailed: "Could not start dieline export. Please try again.",
    dielineFailed: "Dieline export failed. Please try again.",
    dielineDownloaded: (fmt, width, height, coins) =>
      `Downloaded 1:1 mm ${fmt} dieline (${width}×${height} mm)${coins > 0 ? ` · −${coins} coins` : ""}.`,
    shareLivePaid: (coins) => `3D review link is live (−${coins} coins). Copy and share with your client!`,
    shareUpdated: "3D review link updated and synced.",
    shareRevoked: "Revoked and deleted the 3D share link.",
    signInSharePaid: (coins) => `Please sign in to create a 3D client review link (${coins} coins).`,
    signInShareFree: "Please sign in to create a 3D client review link.",
    savedCloudItem: (itemName, groupName) => `Saved "${itemName}" to Cloud project "${groupName}" (30-day storage · ≤ 2048px WebP).`,
    extendedProject: (name, days, coins) =>
      coins > 0
        ? `Extended "${name}" by +${days} days (−${coins} coins).`
        : `Extended "${name}" by +${days} days.`,
    autoRenewEnabled: (name, cost) => `Auto-renew enabled for "${name}" (${cost} coins / 30 days).`,
    autoRenewDisabled: (name) => `Auto-renew turned off for "${name}".`,
    migratedToCloud: (name) => `Synced "${name}" to your Cloud account (30-day storage).`,
    needCoinsExtend: (coins) => `You need at least ${coins} coins to extend this project by 30 days.`,
    projectLimitReached: (max) => `You reached the maximum of ${max} Cloud projects. Please remove an older project first.`,
    cloudActionFailed: "Could not sync with Cloud. Please try again.",
  },
  packaging: {
    dimensionsTitle: "Dimensions (mm)",
    inner: "Inner",
    outer: "Outer",
    innerTitle: "Clear interior space inside the box",
    outerTitle: "Overall exterior shipping footprint",
    resetParamsTitle: "Reset dimensions & material to template defaults",
    length: "Length",
    width: "Width",
    height: "Height",
    oppositeSize: (mode) => (mode === "inner" ? "Outer size" : "Inner size"),
    blankAndWeight: "Flat blank · Est. weight",
    fitBadge: "Fit",
    packTitle: "Add Products",
    packComboBadge: "Combo",
    packIntro: (shortName) =>
      `Place real 3D products (bottles, cans, jars, etc.) with your custom artwork directly inside this ${shortName} and auto-fit exact mm dimensions.`,
    myProjectsTab: (count) => `My Projects (${count})`,
    catalogTab: "Catalog",
    customLabelTag: "Custom label",
    customizeNewBottle: "Customize new bottle in Bottles & Cans",
    noCustomProjectsLead: "No custom projects yet. Customize any bottle or can in ",
    noCustomProjectsHighlight1: "Bottles & Cans",
    noCustomProjectsMid: ", click ",
    noCustomProjectsHighlight2: "Save project",
    noCustomProjectsTail: ", and select it right here!",
    goCustomizeBottle: "Go customize in Bottles & Cans",
    myCustomProjectsGroup: "★ My Custom Projects",
    groupCans: "Aluminum Cans",
    groupGlass: "Glass Bottles",
    groupPet: "PET Bottles",
    groupPp: "PP Bottles",
    customTag: (name) => `Custom: ${name}`,
    activeTag: (name) => `Active: ${name}`,
    labelSyncedTag: "Your label synced",
    activeStudioModelTag: "Active Studio model",
    replaceAllLabels: (count) => `Replace label (all ${count} pcs)`,
    replaceAllLabelsTitle: "Click any product label in 3D or use this button to replace artwork across all packed products",
    resetShort: "Reset",
    resetLabelTitle: "Revert tray label override",
    gridPresetLabel: (_cols, _rows, defaultLabel) => defaultLabel,
    colsLabel: "Cols (L)",
    rowsLabel: "Rows (W)",
    fitCleanly: (count) => `${count}× fit cleanly inside`,
    tightBy: (detail) => `Tight by ${detail}`,
    packCountUnit: (count) => `${count} pcs`,
    autoFitCta: (count, vol) => `Auto-Fit Box to ${count}× ${vol}`,
    bottleSpacing: "Product spacing",
    labelFacingAngle: "Label facing angle",
    autoResizeOnGrid: "Auto-resize box on grid change",
    organicJitter: "Natural hand-packed angle variance",
    rerollAngles: "Randomize angles again",
    boardMaterialTitle: "Board & Material",
    outsideLabel: "Outside",
    insideLabel: "Inside",
    surfaceFinish: "Surface finish (Gloss ↔ Matte)",
    printFinishTitle: "Print Finish",
    printFinishBadge: "Spot UV · Foil",
    applyArea: "Apply area",
    targetAutoArt: "Auto Art",
    targetFrame: "Frame",
    targetFull: "Full",
    tactileRelief: (dir) =>
      `Tactile relief (${dir === "emboss" ? "Emboss ↑" : dir === "deboss" ? "Deboss ↓" : "Flat"})`,
    finishStrength: "Finish strength",
    artworkMaskSens: "Artwork mask sensitivity",
    invertFinishMask: "Invert finish mask",
    uploadFinishMask: "Upload B&W Foil/UV Mask",
    maskSelected: (name) => `Mask: ${name}`,
    clearShort: "Clear",
    finishEmptyHint:
      "Add raised Spot UV lacquer, 24K Gold / Silver / Rose Gold / Holo hot foil stamping & tactile emboss relief.",
    finishActiveHint:
      "Standing still automatically refines studio softbox shadows & highlights.",
    finishPresetLabel: (_id, fallback) => fallback,
    structureTitle: "Structure & Cutouts",
    carrierPackLayout: "Carrier pack layout",
    carrierPackBtn: (layout) => (layout === "4-pack" ? "4-Pk" : layout === "6-pack" ? "6-Pk" : "8-Pk"),
    internalDividers: "Internal cell dividers",
    lidSkirtDepth: "Telescoping lid skirt depth",
    lockTabsPerSide: "Lock tabs per side",
    oneTab: "1 Tab",
    twoTabs: "2 Tabs",
    lockTabWidth: "Lock tab width",
    tuckStyle: "Tuck style",
    tuckReverse: "Reverse",
    tuckStraight: "Straight",
    tuckFlapLength: "Tuck flap length",
    sideFlapGap: "Side-opening flap gap",
    topBottomFlapGap: "Top & bottom flap gap",
    dustFlapTaper: "Corner dust flap taper",
    thumbNotch: "Thumb opening notch",
    frontDisplayScoop: "Front retail display scoop",
    scoopDepth: "Scoop depth",
    carryHandHoles: "Carry hand holes",
    sideHandHoles: "Side carry hand holes",
    handleWidth: "Handle width",
    windowCutout: "Display window cutout",
    windowWidth: "Window width",
    windowHeight: "Window height",
    windowFilm: "Clear PET window film",
    proCadTitle: "Pro CAD Mode",
    proCadBadge: "Eng",
    boardCaliper: "Exact board caliper (t)",
    fluteDirection: "Flute direction",
    alongL: "Along L",
    alongW: "Along W",
    lockFoldClearance: "Lock & fold clearance",
    printBleedMargin: "Print bleed margin",
    showCreaseGuidelines: "Show crease guidelines",
    netSheetArea: "Net sheet area",
    panelsAndCreases: "Panels / Creases",
    panelsFoldsValue: (panels, folds) => `${panels} panels · ${folds} folds`,
    artworkTipLead: "Click any face in 3D ",
    artworkTipBody: "to edit its artwork directly. Each face has its own independent artwork & saved history.",
    printSide: "Print Side",
    boxFacesTitle: (side) => `Box Faces (${side === "outside" ? "Outside" : "Inside"})`,
    faceCount: (count) => `${count} faces`,
    faceCustom: "Custom",
    faceEmpty: "Empty",
    btnAdd: "Add",
    btnReplace: "Replace",
    uploadFaceArt: (code) => `Upload artwork for ${code}`,
    replaceFaceArt: (code) => `Edit / Replace ${code} artwork`,
    faceTint: "Face tint",
    resetTint: "Reset tint",
    removeFaceArt: (code) => `Remove artwork from ${code}`,
    quickTextOn: (code) => `Quick text on ${code}`,
    textPlaceholder: (code) => `e.g. HYPERMOCKUP · ${code}`,
    textColor: "Text color",
    textSize: "Size",
    clearAllFaces: "Clear all box faces",
    faceLabel: (englishLabel) => englishLabel,
    dielineBlank: "Blank",
    dielineCut: "Cut",
    dielineCrease: "Crease",
    dielineBleed: "Bleed",
    modalFaceSubtitle: (label, surface) =>
      `Independent artwork for ${label} (${surface}) only — other faces remain untouched.`,
    modalBottleSubtitleMulti: (count) =>
      `Position your label inside the dieline. Confirming updates all ${count} bottles in this tray.`,
    modalBottleSubtitleSingle: "Position your label inside the dieline to apply it to the packed bottle.",
    modalBottleBadgeMulti: (count) => `APPLIES TO ALL ${count} BOTTLES`,
    modalBottleBadgeSingle: "BOTTLE LABEL",
    modalFaceHistoryHeading: (code, surface) => `${code} (${surface}) history`,
    modalBottleHistoryHeading: "Bottle label history",
    modalFaceHistorySub: (label, surface) => `Isolated artwork history for ${label} (${surface}) only.`,
    modalBottleHistorySub: (modelName) => `Isolated label history for ${modelName} only.`,
    modalFaceHistoryEmpty: (label, surface) =>
      `Artworks you confirm for ${label} (${surface}) will be saved here independently from other faces and bottles.`,
    modalBottleHistoryEmpty: (modelName) =>
      `Labels you confirm for ${modelName} will be saved here independently from box faces.`,
    modalRemoveFace: (code) => `Remove from ${code}`,
    modalResetTrayLabel: "Reset tray bottle label",
  },
};

export const STUDIO_MESSAGES: Record<UiLocale, StudioMessages> = {
  vi: VI_STUDIO_MESSAGES,
  en: EN_STUDIO_MESSAGES,
};
