import type { UiLocale } from "./locale";
import { EN_STUDIO_MESSAGES, VI_STUDIO_MESSAGES, type StudioMessages } from "./studio-messages";

export type { StudioMessages };

export type UiMessages = {
  header: {
    brandAria: string;
    navAria: string;
    home: string;
    studio: string;
    myProjects: string;
    openGuide: string;
    openNotifications: string;
    notificationsRegion: string;
    adminUpdates: string;
    notificationsLoginPrompt: string;
    notificationsEmpty: string;
    notificationsLoading: string;
    notificationKindReply: string;
    notificationKindAdmin: string;
    login: string;
    logout: string;
    langSwitchAria: string;
    switchToVi: string;
    switchToEn: string;
  };
  home: {
    srTitle: string;
    showcaseAria: string;
    webOptimized: string;
    eyebrow: string;
    heroTitle: string;
    featuredModelsAria: string;
    showModelDemo: (name: string) => string;
    startMockup: string;
    parametricCta: string;
    tryLabel: string;
    resetLabel: string;
    foldPlay: string;
    foldPause: string;
    dragOrbitHint: string;
    dragOrbitBoxHint: string;
    dropLabelHint: string;
    lightMoodStudio: string;
    lightMoodDramatic: string;
    lightMoodDaylight: string;
    switchLightAria: string;
    centerColumnAria: string;
    updatesHeading: string;
    openStudio: string;
    unreadLabel: string;
    markAllRead: string;
    allRead: string;
    viewAllUpdates: (count: number) => string;
    collapseUpdates: string;
    closeNotice: string;
    prevNotice: string;
    nextNotice: string;
    noAnnouncements: string;
    promoAlt: string;
    promoTag: string;
    promoTitle: string;
    promoDescVietnam: string;
    promoDescInternational: string;
    promoCta: string;
    promoDotsAria: string;
    rightColumnAria: string;
    checkinTitle: string;
    checkinPausedDesc: string;
    checkinStreakDesc: (streak: number) => string;
    checkinDefaultDesc: string;
    checkinGroupAria: string;
    dayLabel: (day: number) => string;
    today: string;
    dayAria: (dayLabel: string, coins: number, completed: boolean) => string;
    checkinPausedCta: string;
    checkinClaimedCta: (reward: number) => string;
    checkinClaimCta: (reward: number) => string;
    checkinPausedBadge: string;
    checkinClaimedBadge: (reward: number) => string;
    checkinTapTodayBadge: (reward: number) => string;
    feedbackTitle: string;
    feedbackCategoryAria: string;
    feedbackCatIdea: string;
    feedbackCatBug: string;
    feedbackCatModel: string;
    feedbackPlaceholder: string;
    feedbackEmailPlaceholder: string;
    feedbackAsUser: (name: string) => string;
    feedbackLoginPrompt: string;
    feedbackLoginBtn: string;
    feedbackQuotaHint: string;
    feedbackCooldown: (seconds: number) => string;
    feedbackCooldownBtn: (countdown: string) => string;
    feedbackDailyLimit: (limit: number) => string;
    feedbackSend: string;
    feedbackSending: string;
    feedbackSentTitle: string;
    feedbackSentDesc: string;
    feedbackSendAnother: string;
    feedbackTooShort: string;
    feedbackInvalidEmail: string;
    feedbackInvalidInput: string;
    feedbackRateLimit: string;
    feedbackFailed: string;
    defaultUpdates: readonly { tone: "pink" | "blue" | "mint"; title: string; time: string; unread: boolean }[];
  };
  pricing: {
    title: string;
    subtitleVietnam: (amount: string) => string;
    subtitleInternational: (amount: string) => string;
    regionSwitchAria: string;
    regionVietnam: string;
    regionInternational: string;
    activeCurrencyAria: string;
    singleVietnamTitle: string;
    singleInternationalTitle: string;
    singleInternationalSub: string;
    packsAria: (regionLabel: string) => string;
    badgePopular: (bonusPct: number) => string;
    badgeBest: (bonusPct: number) => string;
    badgeBonus: (bonusPct: number) => string;
    badgeStarter: string;
    packAria: (coinsFormatted: string, bonusPct: number, price: string) => string;
    closeCheckoutAria: string;
    eyebrowPolar: string;
    eyebrowSepay: string;
    checkoutTitle: (coinsFormatted: string) => string;
    descPolar: (sandbox: boolean) => string;
    descSepayQr: string;
    descSepayGateway: (sandbox: boolean) => string;
    chooseMethod: string;
    paymentMethodAria: string;
    methodGpay: string;
    methodCard: string;
    methodBank: string;
    polarSafe: string;
    polarTitlePaid: string;
    polarTitleSandbox: string;
    polarTitleReady: string;
    polarSubPaid: string;
    polarSubCountdown: (countdown: string) => string;
    polarSubHint: string;
    qrLoading: string;
    qrAlt: (coins: number, bankName: string) => string;
    qrPaidAria: string;
    qrPaidLabel: string;
    qrExpiredAria: string;
    qrExpiredLabel: string;
    qrSuccessTitle: string;
    qrSuccessSub: string;
    qrCountdownSub: (countdown: string) => string;
    qrExpiredSub: string;
    qrWebhookSub: string;
    qrCreating: string;
    qrSepayTitle: string;
    qrSignInTitle: string;
    qrInitializingSub: string;
    qrAreaAria: string;
    summaryPack: string;
    summaryPrice: string;
    summaryProvider: string;
    summaryMethods: string;
    summaryMethodsValue: string;
    summaryOrderId: string;
    summaryBank: string;
    summaryAccountNo: string;
    summaryAccountOwner: string;
    summaryTransferContent: string;
    summaryMethod: string;
    summaryMethodQr: string;
    summaryStatus: string;
    copyAccountAria: string;
    copyContentAria: string;
    copied: string;
    copy: string;
    statusPaid: string;
    statusConfirming: string;
    statusExpired: string;
    statusLoadingPolar: string;
    statusLoadingSepay: string;
    statusReadyPolar: string;
    statusReadySepay: string;
    statusIdlePolar: string;
    statusIdleSepay: string;
    actionPaidClose: (coinsFormatted: string) => string;
    actionOpeningCheckout: string;
    actionPayNow: (price: string) => string;
    actionChecking: string;
    actionCheckStatus: string;
    actionOpenNewTab: string;
    actionDownloadQr: string;
    actionTransferred: string;
    actionPreparingCheckout: string;
    actionNewCheckout: string;
    actionNewQr: string;
    actionOpenQr: string;
    actionContinuePolar: (price: string) => string;
    actionCreateQr: string;
    actionSignInToBuy: string;
    receiptSummary: string;
    receiptBuyerPlaceholder: string;
    receiptTaxPlaceholder: string;
    receiptEmailPlaceholder: string;
    receiptAddressPlaceholder: string;
    receiptHint: string;
    receiptSaving: string;
    receiptSave: string;
    receiptSaved: string;
    receiptInvalid: string;
    receiptSaveFailed: string;
    policyHeading: string;
    policyPolar: string;
    policySepay: string;
    linkTerms: string;
    linkRefund: string;
    linkPrivacy: string;
    linkComplaints: string;
    errRegionRestricted: string;
    errSignInRequired: string;
    errPolarNotConfigured: string;
    errSepayNotConfigured: string;
    errPolarFailed: string;
    errSepayMismatch: string;
    errPublicUrlRequired: string;
    errCreateOrderFailed: string;
    errEmbedOpenFailed: string;
    hintPendingPolar: string;
    hintPendingSepay: string;
  };
  auth: {
    loginTitle: string;
    loginAction: string;
    registerTitle: string;
    registerAction: string;
    forgotEyebrow: string;
    forgotTitle: string;
    forgotDescription: string;
    forgotAction: string;
    closeAria: string;
    googleConnecting: string;
    googleContinue: string;
    googleUnavailable: string;
    googleConnectError: string;
    googleOauthFailed: string;
    dividerEmail: string;
    nameLabel: string;
    namePlaceholder: string;
    emailLabel: string;
    emailPlaceholder: string;
    codeLabel: string;
    codePlaceholder: string;
    sending: string;
    resendIn: (seconds: number) => string;
    resendCode: string;
    sendCode: string;
    codeSentHint: (email: string) => string;
    codePromptHint: string;
    passwordLabel: string;
    newPasswordLabel: string;
    forgotPasswordLink: string;
    passwordLoginPlaceholder: string;
    passwordForgotPlaceholder: string;
    passwordRegisterPlaceholder: string;
    showPasswordAria: string;
    hidePasswordAria: string;
    passwordHint: string;
    consentPrefix: string;
    consentTerms: string;
    consentAnd: string;
    consentPrivacy: string;
    consentSuffix: string;
    consentRequiredError: string;
    loginLegalPrefix: string;
    loginLegalTerms: string;
    loginLegalPrivacy: string;
    pleaseWait: string;
    backToLogin: string;
    newToBrand: string;
    alreadyHaveAccount: string;
    createAccountLink: string;
    loginLink: string;
    valNameRequired: string;
    valEmailRequired: string;
    valEmailInvalid: string;
    valCodeInvalid: string;
    valPasswordRequired: string;
    valPasswordWeak: string;
    errInvalidCredentials: string;
    errEmailExists: string;
    errInvalidCode: string;
    errCodeExpired: string;
    errCodeTooMany: string;
    errCooldown: string;
    errRateLimit: string;
    errEmailNotConfigured: string;
    errEmailSendFailed: string;
    errRegistrationsDisabled: string;
    errConsentRequired: string;
    errInvalidInputLogin: string;
    errInvalidInputOther: string;
    errGeneric: string;
  };
  profile: {
    ariaLabel: string;
    eyebrow: string;
    viewNotificationsAria: (count: number) => string;
    accountDetailsAria: string;
    signInAria: string;
    yourAccount: string;
    guestAccount: string;
    signedIn: string;
    guestSubtitle: string;
    daysCheckedIn: string;
    daysUnit: string;
    coinBalance: string;
    signInShort: string;
    badges: string;
    defaultBadge: string;
    recentActivity: string;
    downloadStatement: string;
    downloadingStatement: string;
    downloadStatementAria: string;
    emptyActivity: string;
    guestPromptVietnam: string;
    guestPromptInternational: string;
    guestPromptAria: string;
    login: string;
    createAccount: string;
    coinsAria: (amount: number) => string;
    entryWelcome: string;
    entryLaunchPromo: string;
    entryCheckin: string;
    entryPurchase: string;
    entryAdmin: string;
    entryRefund: string;
    entryDieline: string;
    entryRender: string;
    entryDielineRefund: string;
    entryRenderRefund: string;
    entryReward: string;
    entrySpend: string;
    minutesAgo: (n: number) => string;
    hoursAgo: (n: number) => string;
    daysAgo: (n: number) => string;
  };
  footer: {
    ariaLabel: string;
    linksAria: string;
    ownerSummaryNamed: (name: string, taxId: string) => string;
    ownerSummaryFallback: string;
    ownerInfoButton: string;
    about: string;
    contact: string;
    terms: string;
    privacy: string;
    refund: string;
    complaints: string;
    moitBadge: string;
    emailAria: (email: string) => string;
    modalCloseAria: string;
    modalTitle: string;
    modalIntro: string;
    labelOwner: string;
    labelTaxId: string;
    labelAddress: string;
    labelPhone: string;
    labelEmail: string;
    labelDomain: string;
    pendingOwner: string;
    pendingGeneric: string;
    pendingAddress: string;
    termsFull: string;
  };
  cookie: {
    ariaLabel: string;
    title: string;
    copyPrefix: string;
    privacyLink: string;
    essentialBtn: string;
    acceptBtn: string;
  };
  paymentResult: {
    sepayEyebrow: string;
    sepayTitlePaid: string;
    sepayTitleConfirming: string;
    sepayTitleCancel: string;
    sepayTitleError: string;
    sepayChecking: string;
    sepayDelayed: string;
    sepayCredited: (coins: number) => string;
    polarEyebrow: string;
    polarTitlePaid: string;
    polarTitleConfirming: string;
    polarTitleCancel: string;
    polarChecking: string;
    polarDelayed: string;
    polarCredited: (coins: number) => string;
    orderCodeLabel: string;
    backHome: string;
    openStudio: string;
    notFoundTitle: string;
  };
  studio: StudioMessages;
};

const VI_MESSAGES: UiMessages = {
  header: {
    brandAria: "Trang chủ HyperMockup",
    navAria: "Điều hướng chính",
    home: "Trang chủ",
    studio: "Mockup Studio",
    myProjects: "Dự án của tôi",
    openGuide: "Hướng dẫn sử dụng",
    openNotifications: "Mở thông báo từ Admin",
    notificationsRegion: "Thông báo từ Admin",
    adminUpdates: "Thông báo từ Admin",
    notificationsLoginPrompt: "Đăng nhập để nhận phản hồi góp ý và thông báo riêng từ quản trị viên.",
    notificationsEmpty: "Bạn chưa có thông báo nào từ quản trị viên.",
    notificationsLoading: "Đang tải thông báo…",
    notificationKindReply: "Phản hồi góp ý",
    notificationKindAdmin: "Từ Admin",
    login: "Đăng nhập",
    logout: "Đăng xuất",
    langSwitchAria: "Chọn ngôn ngữ hiển thị",
    switchToVi: "Chuyển sang Tiếng Việt",
    switchToEn: "Chuyển sang Tiếng Anh",
  },
  home: {
    srTitle: "Bảng điều khiển mockup bao bì 3D HyperMockup",
    showcaseAria: "Mockup 3D nổi bật",
    webOptimized: "Tối ưu web",
    eyebrow: "Hiện thực hóa ý tưởng",
    heroTitle: "Mockup 3D chuẩn studio.",
    featuredModelsAria: "Mẫu mockup nổi bật",
    showModelDemo: (name) => `Xem mẫu 3D ${name}`,
    startMockup: "Tạo mockup mới",
    parametricCta: "Hộp & khay tham số (mm)",
    tryLabel: "Thử nhãn",
    resetLabel: "Nhãn mẫu",
    foldPlay: "Gấp 3D",
    foldPause: "Dừng gấp",
    dragOrbitHint: "Kéo để xoay 360° · Kéo thả ảnh nhãn vào đây",
    dragOrbitBoxHint: "Kéo để xoay 360° · Bấm Gấp 3D để xem mở hộp",
    dropLabelHint: "Thả ảnh nhãn hàng để bọc thử trực tiếp lên mẫu 3D",
    lightMoodStudio: "Studio",
    lightMoodDramatic: "Tương phản",
    lightMoodDaylight: "Ánh sáng tự nhiên",
    switchLightAria: "Đổi ánh sáng studio 3D",
    centerColumnAria: "Gói nạp coin và cập nhật",
    updatesHeading: "Cập nhật hệ thống",
    openStudio: "Mở Studio",
    unreadLabel: "Chưa đọc",
    markAllRead: "Đã đọc hết",
    allRead: "Đã đọc tất cả thông báo",
    viewAllUpdates: (count) => `Xem tất cả (${count})`,
    collapseUpdates: "Thu gọn",
    closeNotice: "Đóng",
    prevNotice: "Thông báo trước",
    nextNotice: "Thông báo tiếp theo",
    noAnnouncements: "Hiện chưa có thông báo mới.",
    promoAlt: "Các mẫu mockup bao bì 3D sống động",
    promoTag: "Studio 3D",
    promoTitle: "Render nhiều hơn. Tiết kiệm hơn.",
    promoDescVietnam: "Nạp coin VietQR tức thì, tự động cộng ngay sau vài giây.",
    promoDescInternational: "Nạp coin nhanh qua thẻ quốc tế, Apple Pay hoặc Google Pay.",
    promoCta: "Mở Studio",
    promoDotsAria: "Slide khuyến mãi",
    rightColumnAria: "Tài khoản và điểm danh hằng ngày",
    checkinTitle: "Điểm danh hằng ngày",
    checkinPausedDesc: "Điểm danh hằng ngày đang tạm dừng",
    checkinStreakDesc: (streak) => `Chuỗi ${streak} ngày · Bỏ lỡ 1 ngày sẽ đặt lại về Ngày 1`,
    checkinDefaultDesc: "Điểm danh mỗi ngày — bỏ lỡ sẽ đặt lại về Ngày 1",
    checkinGroupAria: "Tiến độ điểm danh 7 ngày",
    dayLabel: (day) => `Ngày ${day}`,
    today: "Hôm nay",
    dayAria: (dayLabel, coins, completed) =>
      `${dayLabel}, ${coins} coin${completed ? ", đã nhận" : ""}`,
    checkinPausedCta: "Tạm dừng điểm danh",
    checkinClaimedCta: (reward) => `Đã nhận thưởng (+${reward})`,
    checkinClaimCta: (reward) => `Nhận ngay +${reward} coin`,
    checkinPausedBadge: "Tạm dừng",
    checkinClaimedBadge: (reward) => `Đã nhận +${reward}`,
    checkinTapTodayBadge: (reward) => `Bấm Hôm nay +${reward}`,
    feedbackTitle: "Gửi thư góp ý",
    feedbackCategoryAria: "Chọn loại góp ý",
    feedbackCatIdea: "Góp ý",
    feedbackCatBug: "Báo lỗi",
    feedbackCatModel: "Mẫu 3D",
    feedbackPlaceholder: "Góp ý tính năng, báo lỗi hoặc đề xuất mẫu mockup 3D mới...",
    feedbackEmailPlaceholder: "Email liên hệ (tùy chọn)",
    feedbackAsUser: (name) => `Gửi từ ${name}`,
    feedbackLoginPrompt: "Đăng nhập tài khoản để gửi góp ý trực tiếp cho đội ngũ HyperMockup.",
    feedbackLoginBtn: "Đăng nhập để gửi góp ý",
    feedbackQuotaHint: "Tối đa 10 thư/ngày · cách nhau 2 phút",
    feedbackCooldown: (seconds) => `Vui lòng đợi ${seconds} giây trước khi gửi góp ý tiếp theo.`,
    feedbackCooldownBtn: (countdown) => `Đợi ${countdown}`,
    feedbackDailyLimit: (limit) => `Bạn đã đạt giới hạn ${limit} góp ý trong hôm nay. Hẹn bạn ngày mai!`,
    feedbackSend: "Gửi góp ý",
    feedbackSending: "Đang gửi...",
    feedbackSentTitle: "Đã gửi góp ý thành công!",
    feedbackSentDesc: "Cảm ơn bạn — đội ngũ quản trị đã nhận được thư góp ý của bạn.",
    feedbackSendAnother: "Gửi thêm góp ý",
    feedbackTooShort: "Vui lòng nhập ít nhất 3 ký tự.",
    feedbackInvalidEmail: "Email không đúng định dạng.",
    feedbackInvalidInput: "Nội dung góp ý chưa hợp lệ.",
    feedbackRateLimit: "Bạn gửi quá nhanh, vui lòng thử lại sau ít phút.",
    feedbackFailed: "Không thể gửi lúc này, vui lòng thử lại.",
    defaultUpdates: [
      { tone: "mint", title: "Ra mắt Hộp CAD 3D: FEFCO 0201, 0201E & Vách tổ ong", time: "26/11/2026", unread: true },
      { tone: "blue", title: "Ánh sáng HDRI + Spotlight 3D, Lưu Cloud & Link chia sẻ", time: "26/11/2026", unread: true },
      { tone: "pink", title: "Điểm danh 7 ngày nhận chuỗi thưởng đến +100 coin miễn phí", time: "26/11/2026", unread: false },
    ],
  },
  pricing: {
    title: "Gói nạp coin",
    subtitleVietnam: (amount) => `Render ảnh 3D và nhiều công cụ hữu dụng khác chỉ từ 5 coins, chỉ tương đương ${amount} VNĐ.`,
    subtitleInternational: (amount) => `Render ảnh 3D và nhiều công cụ hữu dụng khác chỉ từ 5 coins, chỉ tương đương ${amount}.`,
    regionSwitchAria: "Chọn khu vực giá (Xem trước Admin)",
    regionVietnam: "Việt Nam",
    regionInternational: "Quốc tế",
    activeCurrencyAria: "Tiền tệ thanh toán áp dụng",
    singleVietnamTitle: "Việt Nam · VND (VietQR)",
    singleInternationalTitle: "Quốc tế · USD",
    singleInternationalSub: "Polar.sh (Merchant of Record)",
    packsAria: (regionLabel) => `Danh sách gói coin ${regionLabel}`,
    badgePopular: (bonusPct) => `Phổ biến · +${bonusPct}%`,
    badgeBest: (bonusPct) => `Tốt nhất · +${bonusPct}%`,
    badgeBonus: (bonusPct) => `Tặng +${bonusPct}%`,
    badgeStarter: "Khởi đầu",
    packAria: (coinsFormatted, bonusPct, price) =>
      `${coinsFormatted} coins${bonusPct ? `, tặng thêm ${bonusPct}%` : ""}, giá ${price}`,
    closeCheckoutAria: "Đóng bảng nạp coin",
    eyebrowPolar: "Nạp coin quốc tế · USD",
    eyebrowSepay: "Nạp coin nội địa · VND",
    checkoutTitle: (coinsFormatted) => `Nạp ${coinsFormatted} coins`,
    descPolar: (sandbox) =>
      `Thanh toán an toàn qua Visa, Mastercard, Apple Pay hoặc Google Pay bằng Polar${sandbox ? " (Sandbox)" : ""}`,
    descSepayQr: "Quét mã VietQR bằng app ngân hàng — coin tự cộng ngay sau khi chuyển khoản",
    descSepayGateway: (sandbox) =>
      sandbox ? "Thanh toán QR VietQR qua SePay (Chế độ thử nghiệm)" : "Thanh toán QR VietQR qua SePay",
    chooseMethod: "Chọn phương thức",
    paymentMethodAria: "Phương thức thanh toán",
    methodGpay: "Google Pay",
    methodCard: "Thẻ",
    methodBank: "Ngân hàng",
    polarSafe: "Thanh toán Polar trực tiếp · Không rời trang",
    polarTitlePaid: "Thanh toán thành công!",
    polarTitleSandbox: "Polar Sandbox · Thanh toán tại chỗ",
    polarTitleReady: "Thanh toán trực tiếp ngay tại trang",
    polarSubPaid: "Số dư coin đã được cộng vào tài khoản của bạn.",
    polarSubCountdown: (countdown) => `Phiên thanh toán còn hiệu lực ${countdown}`,
    polarSubHint: "Chọn một phương thức phía trên để mở cổng thanh toán ngay tại đây.",
    qrLoading: "Đang tải QR…",
    qrAlt: (coins, bankName) => `Mã QR thanh toán ${coins} coins qua ${bankName}`,
    qrPaidAria: "Đã thanh toán thành công",
    qrPaidLabel: "Đã cộng coin",
    qrExpiredAria: "Mã QR đã hết hạn",
    qrExpiredLabel: "Mã đã hết hạn",
    qrSuccessTitle: "Thanh toán thành công!",
    qrSuccessSub: "Số dư coin đã được cập nhật vào tài khoản.",
    qrCountdownSub: (countdown) => `Quét trực tiếp bằng app ngân hàng · Hết hạn sau ${countdown}`,
    qrExpiredSub: "Bấm Tạo mã QR mới nếu bạn chưa chuyển khoản.",
    qrWebhookSub: "Chỉ ghi nhận coin sau khi webhook SePay xác nhận thanh toán.",
    qrCreating: "Đang tạo mã QR…",
    qrSepayTitle: "QR thanh toán SePay",
    qrSignInTitle: "Đăng nhập để hiện QR",
    qrInitializingSub: "Đang khởi tạo mã VietQR từ máy chủ…",
    qrAreaAria: "Khu vực QR thanh toán SePay",
    summaryPack: "Gói coin",
    summaryPrice: "Số tiền",
    summaryProvider: "Cổng thanh toán",
    summaryMethods: "Phương thức",
    summaryMethodsValue: "Thẻ · Apple Pay · Google Pay",
    summaryOrderId: "Mã đơn",
    summaryBank: "Ngân hàng",
    summaryAccountNo: "Số tài khoản",
    summaryAccountOwner: "Chủ tài khoản",
    summaryTransferContent: "Nội dung CK",
    summaryMethod: "Phương thức",
    summaryMethodQr: "Quét QR ngân hàng",
    summaryStatus: "Trạng thái",
    copyAccountAria: "Sao chép số tài khoản",
    copyContentAria: "Sao chép nội dung chuyển khoản",
    copied: "Đã chép",
    copy: "Chép",
    statusPaid: "Đã thanh toán · đã cộng coin",
    statusConfirming: "Đang xác nhận thanh toán…",
    statusExpired: "Đơn đã hết hạn",
    statusLoadingPolar: "Đang tạo phiên Polar…",
    statusLoadingSepay: "Đang tạo mã QR…",
    statusReadyPolar: "Sẵn sàng · Thanh toán ngay tại trang",
    statusReadySepay: "Chờ chuyển khoản · tự động cộng coin",
    statusIdlePolar: "Sẵn sàng thanh toán",
    statusIdleSepay: "Chưa tạo đơn",
    actionPaidClose: (coinsFormatted) => `Đã cộng ${coinsFormatted} coins · Đóng`,
    actionOpeningCheckout: "Đang mở cổng thanh toán…",
    actionPayNow: (price) => `Thanh toán ${price} ngay`,
    actionChecking: "Đang kiểm tra…",
    actionCheckStatus: "Kiểm tra trạng thái",
    actionOpenNewTab: "Mở ở tab mới",
    actionDownloadQr: "Tải ảnh QR",
    actionTransferred: "Tôi đã chuyển khoản",
    actionPreparingCheckout: "Đang khởi tạo…",
    actionNewCheckout: "Tạo phiên thanh toán mới",
    actionNewQr: "Tạo mã QR mới",
    actionOpenQr: "Mở QR thanh toán",
    actionContinuePolar: (price) => `Tiếp tục qua Polar (${price})`,
    actionCreateQr: "Tạo mã QR thanh toán",
    actionSignInToBuy: "Đăng nhập để nạp coin",
    receiptSummary: "Thông tin biên nhận / hóa đơn (tùy chọn)",
    receiptBuyerPlaceholder: "Họ tên hoặc Tên công ty",
    receiptTaxPlaceholder: "Mã số thuế (nếu có)",
    receiptEmailPlaceholder: "Email nhận biên nhận",
    receiptAddressPlaceholder: "Địa chỉ liên hệ",
    receiptHint: "Lưu kèm mã đơn hàng để đối soát biên nhận/hóa đơn theo quy định thuế cá nhân.",
    receiptSaving: "Đang lưu…",
    receiptSave: "Lưu thông tin",
    receiptSaved: "Đã lưu thông tin biên nhận/hóa đơn cho đơn hàng.",
    receiptInvalid: "Vui lòng nhập ít nhất một thông tin hợp lệ (và đúng định dạng email nếu điền email).",
    receiptSaveFailed: "Không thể lưu thông tin biên nhận.",
    policyHeading: "Chính sách giao dịch & Thuế",
    policyPolar:
      "Coin đã mua không hết hạn khi tài khoản còn hoạt động, không chuyển nhượng, không quy đổi tiền mặt và tự động cộng qua webhook đã ký của Polar. Thuế VAT/Sales Tax quốc tế do Polar.sh xử lý với tư cách Merchant of Record (áp dụng cho khách ngoài Việt Nam).",
    policySepay:
      "Giá niêm yết bằng VND đã bao gồm nghĩa vụ thuế theo quy định (nếu có). Coin là tín dụng dịch vụ nội bộ, không quy đổi tiền mặt, không chuyển nhượng; Coin đã mua không hết hạn khi tài khoản còn hoạt động. Vui lòng giữ nguyên số tiền và nội dung chuyển khoản.",
    linkTerms: "Điều khoản",
    linkRefund: "Thanh toán & Hoàn tiền",
    linkPrivacy: "Bảo mật",
    linkComplaints: "Khiếu nại",
    errRegionRestricted:
      "Theo quy định quản lý ngoại hối tại Việt Nam (TT 32/2013/TT-NHNN), khách hàng tại Việt Nam vui lòng thanh toán bằng VND qua VietQR.",
    errSignInRequired: "Bạn cần đăng nhập trước khi nạp coin.",
    errPolarNotConfigured: "Cổng thanh toán thẻ quốc tế (Polar.sh) đang được cấu hình trên máy chủ.",
    errSepayNotConfigured: "Cổng thanh toán SePay chưa được cấu hình trên máy chủ.",
    errPolarFailed: "Không thể khởi tạo phiên thanh toán Polar. Vui lòng thử lại.",
    errSepayMismatch: "Cấu hình môi trường SePay (Sandbox/Production) chưa khớp với khóa merchant.",
    errPublicUrlRequired: "Cần cấu hình URL HTTPS công khai để cổng thanh toán gọi webhook.",
    errCreateOrderFailed: "Không thể tạo đơn thanh toán. Vui lòng thử lại.",
    errEmbedOpenFailed: "Không thể mở khung thanh toán trực tiếp. Bạn hãy dùng liên kết mở tab mới bên dưới.",
    hintPendingPolar: "Hệ thống chưa nhận được xác nhận — coin sẽ tự cộng ngay khi Polar duyệt giao dịch thẻ.",
    hintPendingSepay: "Hệ thống chưa nhận được giao dịch — coin sẽ tự cộng sau vài giây khi chuyển khoản xong.",
  },
  auth: {
    loginTitle: "Đăng nhập",
    loginAction: "Đăng nhập",
    registerTitle: "Tạo tài khoản",
    registerAction: "Tạo tài khoản",
    forgotEyebrow: "KHÔI PHỤC TRUY CẬP",
    forgotTitle: "Đặt lại mật khẩu",
    forgotDescription: "Gửi mã xác nhận 6 chữ số tới email của bạn, sau đó tạo mật khẩu mới.",
    forgotAction: "Đặt lại mật khẩu",
    closeAria: "Đóng hộp thoại tài khoản",
    googleConnecting: "Đang kết nối Google…",
    googleContinue: "Tiếp tục với Google",
    googleUnavailable: "Đăng nhập Google tạm thời chưa khả dụng. Vui lòng thử lại sau.",
    googleConnectError: "Không thể kết nối đăng nhập Google. Vui lòng thử lại.",
    googleOauthFailed: "Không thể hoàn tất đăng nhập bằng Google. Vui lòng thử lại.",
    dividerEmail: "hoặc tiếp tục bằng email",
    nameLabel: "Tên hiển thị",
    namePlaceholder: "Nhập tên hiển thị của bạn",
    emailLabel: "Địa chỉ email",
    emailPlaceholder: "ban@example.com",
    codeLabel: "Mã xác thực email",
    codePlaceholder: "Nhập mã 6 chữ số",
    sending: "Đang gửi…",
    resendIn: (seconds) => `Gửi lại sau ${seconds}s`,
    resendCode: "Gửi lại mã",
    sendCode: "Gửi mã",
    codeSentHint: (email) => `Chúng tôi đã gửi mã 6 chữ số đến ${email}. Kiểm tra mục Spam nếu chưa thấy.`,
    codePromptHint: "Bấm Gửi mã để nhận mã xác thực 6 chữ số qua email.",
    passwordLabel: "Mật khẩu",
    newPasswordLabel: "Mật khẩu mới",
    forgotPasswordLink: "Quên mật khẩu?",
    passwordLoginPlaceholder: "Nhập mật khẩu của bạn",
    passwordForgotPlaceholder: "Tạo mật khẩu mới",
    passwordRegisterPlaceholder: "Tạo mật khẩu",
    showPasswordAria: "Hiện mật khẩu",
    hidePasswordAria: "Ẩn mật khẩu",
    passwordHint: "Dùng tối thiểu 12 ký tự gồm cả chữ cái và chữ số.",
    consentPrefix: "Tôi đồng ý với ",
    consentTerms: "Điều khoản sử dụng",
    consentAnd: " và ",
    consentPrivacy: "Chính sách bảo mật dữ liệu cá nhân",
    consentSuffix:
      " (bao gồm việc lưu trữ/xử lý dữ liệu trên hạ tầng đám mây quốc tế Cloudflare, Google, dịch vụ gửi OTP để vận hành tài khoản).",
    consentRequiredError: "Vui lòng tích đồng ý Điều khoản sử dụng và Chính sách bảo mật dữ liệu cá nhân trước khi đăng ký.",
    loginLegalPrefix: "Khi đăng nhập, bạn tuân thủ ",
    loginLegalTerms: "Điều khoản",
    loginLegalPrivacy: "Chính sách bảo mật",
    pleaseWait: "Vui lòng chờ…",
    backToLogin: "Quay lại đăng nhập",
    newToBrand: "Chưa có tài khoản HyperMockup?",
    alreadyHaveAccount: "Đã có tài khoản?",
    createAccountLink: "Tạo tài khoản",
    loginLink: "Đăng nhập",
    valNameRequired: "Vui lòng nhập tên hiển thị.",
    valEmailRequired: "Vui lòng nhập địa chỉ email.",
    valEmailInvalid: "Vui lòng nhập địa chỉ email hợp lệ.",
    valCodeInvalid: "Vui lòng nhập đủ mã 6 chữ số đã gửi về email.",
    valPasswordRequired: "Vui lòng nhập mật khẩu.",
    valPasswordWeak: "Dùng tối thiểu 12 ký tự gồm cả chữ cái và chữ số.",
    errInvalidCredentials: "Email hoặc mật khẩu không chính xác.",
    errEmailExists: "Email này đã được đăng ký. Hãy chuyển sang đăng nhập.",
    errInvalidCode: "Mã xác thực 6 chữ số không chính xác.",
    errCodeExpired: "Mã xác thực đã hết hạn. Vui lòng yêu cầu mã mới.",
    errCodeTooMany: "Nhập sai mã quá nhiều lần. Vui lòng yêu cầu mã mới.",
    errCooldown: "Vui lòng chờ một lát trước khi gửi lại mã mới.",
    errRateLimit: "Thao tác quá nhanh. Vui lòng đợi một lát rồi thử lại.",
    errEmailNotConfigured: "Dịch vụ gửi email xác thực chưa được cấu hình trên máy chủ.",
    errEmailSendFailed: "Không thể gửi email xác thực. Vui lòng thử lại sau ít phút.",
    errRegistrationsDisabled: "Đăng ký tài khoản mới hiện đang tạm khóa.",
    errConsentRequired: "Vui lòng đồng ý Điều khoản sử dụng và Chính sách bảo mật trước khi tạo tài khoản.",
    errInvalidInputLogin: "Vui lòng kiểm tra lại email và mật khẩu.",
    errInvalidInputOther: "Hãy dùng email hợp lệ, mã 6 chữ số và mật khẩu từ 12 ký tự gồm chữ và số.",
    errGeneric: "Không thể hoàn tất truy cập tài khoản. Vui lòng thử lại.",
  },
  profile: {
    ariaLabel: "Hồ sơ tài khoản",
    eyebrow: "Hồ sơ của bạn",
    viewNotificationsAria: (count) => `Xem ${count} thông báo`,
    accountDetailsAria: "Chi tiết tài khoản",
    signInAria: "Đăng nhập",
    yourAccount: "Tài khoản của bạn",
    guestAccount: "Tài khoản khách",
    signedIn: "Đã đăng nhập",
    guestSubtitle: "Đăng nhập để đồng bộ coin & thưởng",
    daysCheckedIn: "Ngày điểm danh",
    daysUnit: "ngày",
    coinBalance: "Số dư coin",
    signInShort: "Đăng nhập",
    badges: "Huy hiệu",
    defaultBadge: "Starter",
    recentActivity: "Hoạt động coin gần đây",
    downloadStatement: "Tải sao kê",
    downloadingStatement: "Đang tải…",
    downloadStatementAria: "Tải sao kê hoạt động coin (CSV)",
    emptyActivity: "Lịch sử giao dịch coin của bạn sẽ hiển thị tại đây.",
    guestPromptVietnam: "Đăng nhập để nhận coin hằng ngày, nạp qua VietQR và đồng bộ số dư Studio 3D.",
    guestPromptInternational: "Đăng nhập để nhận coin hằng ngày, nạp qua thẻ quốc tế và đồng bộ số dư Studio 3D.",
    guestPromptAria: "Đăng nhập vào tài khoản của bạn",
    login: "Đăng nhập",
    createAccount: "Tạo tài khoản",
    coinsAria: (amount) => `${amount} coins`,
    entryWelcome: "Quà chào mừng",
    entryLaunchPromo: "Quà ra mắt website",
    entryCheckin: "Điểm danh hằng ngày",
    entryPurchase: "Nạp coin",
    entryAdmin: "Điều chỉnh từ Admin",
    entryRefund: "Hoàn coin",
    entryDieline: "Xuất Dieline (1:1 mm)",
    entryRender: "Render ảnh",
    entryDielineRefund: "Hoàn coin Dieline",
    entryRenderRefund: "Hoàn coin Render",
    entryReward: "Thưởng coin",
    entrySpend: "Sử dụng coin",
    minutesAgo: (n) => `${n} phút trước`,
    hoursAgo: (n) => `${n} giờ trước`,
    daysAgo: (n) => `${n} ngày trước`,
  },
  footer: {
    ariaLabel: "Thông tin pháp lý và điều khoản",
    linksAria: "Liên kết pháp lý",
    ownerSummaryNamed: (name, taxId) => `Chủ sở hữu: ${name}${taxId ? ` · MST: ${taxId}` : ""}`,
    ownerSummaryFallback: "Kinh doanh cá nhân tại Việt Nam",
    ownerInfoButton: "Thông tin chủ sở hữu",
    about: "Giới thiệu",
    contact: "Liên hệ",
    terms: "Điều khoản",
    privacy: "Bảo mật",
    refund: "Thanh toán & Hoàn tiền",
    complaints: "Khiếu nại & Bản quyền",
    moitBadge: "Đã thông báo BCT",
    emailAria: (email) => `Gửi email hỗ trợ tới ${email}`,
    modalCloseAria: "Đóng hộp thoại thông tin chủ sở hữu",
    modalTitle: "Thông tin chủ sở hữu website",
    modalIntro:
      "Công khai thông tin theo Luật Thương mại điện tử 122/2025/QH15 và Nghị định 248/2026/NĐ-CP (mô hình cá nhân kinh doanh tại Việt Nam).",
    labelOwner: "Chủ sở hữu cá nhân",
    labelTaxId: "Mã số thuế cá nhân",
    labelAddress: "Địa chỉ liên hệ",
    labelPhone: "Số điện thoại hỗ trợ",
    labelEmail: "Email hỗ trợ & khiếu nại",
    labelDomain: "Tên miền hoạt động",
    pendingOwner: "Đang cập nhật trong Admin → Pháp lý & Thuế",
    pendingGeneric: "Đang cập nhật",
    pendingAddress: "Việt Nam (đang cập nhật)",
    termsFull: "Điều khoản sử dụng",
  },
  cookie: {
    ariaLabel: "Thông báo cookie và dữ liệu cá nhân",
    title: "Cookie & Quyền riêng tư dữ liệu",
    copyPrefix:
      "HyperMockup dùng cookie thiết yếu để duy trì đăng nhập an toàn và có thể ghi nhận thống kê truy cập tổng hợp nếu bạn đồng ý. Xem chi tiết tại ",
    privacyLink: "Chính sách bảo mật dữ liệu",
    essentialBtn: "Chỉ dùng thiết yếu",
    acceptBtn: "Đồng ý phân tích",
  },
  paymentResult: {
    sepayEyebrow: "HYPERMOCKUP · SEPAY",
    sepayTitlePaid: "Nạp coin thành công",
    sepayTitleConfirming: "Đang xác nhận thanh toán",
    sepayTitleCancel: "Bạn đã hủy thanh toán",
    sepayTitleError: "Thanh toán chưa hoàn tất",
    sepayChecking: "SePay đang gửi xác nhận. Coin chỉ được cộng sau khi máy chủ nhận webhook hợp lệ.",
    sepayDelayed:
      "Chưa nhận được xác nhận trong thời gian chờ. Bạn có thể mở lại ví sau ít phút hoặc liên hệ hỗ trợ kèm mã đơn.",
    sepayCredited: (coins) => `Đã cộng +${coins.toLocaleString("vi-VN")} coins vào tài khoản của bạn.`,
    polarEyebrow: "HYPERMOCKUP · POLAR QUỐC TẾ",
    polarTitlePaid: "Thanh toán thành công!",
    polarTitleConfirming: "Đang xác nhận thanh toán…",
    polarTitleCancel: "Bạn đã hủy phiên thanh toán",
    polarChecking: "Polar đang gửi webhook xác nhận đã ký. Coin sẽ tự động cộng sau vài giây.",
    polarDelayed:
      "Vẫn đang chờ xác nhận từ cổng thanh toán. Vui lòng kiểm tra ví trên trang chủ sau ít phút hoặc gửi mã đơn cho bộ phận hỗ trợ.",
    polarCredited: (coins) => `Đã cộng +${coins.toLocaleString("vi-VN")} coins vào tài khoản của bạn!`,
    orderCodeLabel: "Mã đơn:",
    backHome: "Về trang chủ",
    openStudio: "Mở Studio",
    notFoundTitle: "Không tìm thấy giao dịch",
  },
  studio: VI_STUDIO_MESSAGES,
};

const EN_MESSAGES: UiMessages = {
  header: {
    brandAria: "HyperMockup home",
    navAria: "Main navigation",
    home: "Home",
    studio: "Mockup Studio",
    myProjects: "My projects",
    openGuide: "User guide",
    openNotifications: "Open Admin notifications",
    notificationsRegion: "Admin notifications",
    adminUpdates: "Admin notifications",
    notificationsLoginPrompt: "Sign in to view feedback replies and personal notices from Admin.",
    notificationsEmpty: "You have no messages from Admin yet.",
    notificationsLoading: "Loading notifications…",
    notificationKindReply: "Feedback reply",
    notificationKindAdmin: "From Admin",
    login: "Login",
    logout: "Log out",
    langSwitchAria: "Select display language",
    switchToVi: "Switch to Vietnamese",
    switchToEn: "Switch to English",
  },
  home: {
    srTitle: "HyperMockup 3D packaging mockup dashboard",
    showcaseAria: "Featured 3D mockup",
    webOptimized: "Web optimized",
    eyebrow: "Make it real",
    heroTitle: "Studio-grade 3D mockups.",
    featuredModelsAria: "Featured mockup models",
    showModelDemo: (name) => `Show ${name} 3D demo`,
    startMockup: "Start a new mockup",
    parametricCta: "Parametric Boxes & Trays (mm)",
    tryLabel: "Try label",
    resetLabel: "Reset art",
    foldPlay: "Fold 3D",
    foldPause: "Pause fold",
    dragOrbitHint: "Drag to orbit 360° · Drop your label image here",
    dragOrbitBoxHint: "Drag to orbit 360° · Click Fold 3D to animate",
    dropLabelHint: "Drop your label artwork to wrap it live in 3D",
    lightMoodStudio: "Studio",
    lightMoodDramatic: "Contrast",
    lightMoodDaylight: "Daylight",
    switchLightAria: "Switch 3D studio lighting preset",
    centerColumnAria: "Coin packages and updates",
    updatesHeading: "System updates",
    openStudio: "Open Studio",
    unreadLabel: "Unread",
    markAllRead: "Mark all read",
    allRead: "All updates read",
    viewAllUpdates: (count) => `View all (${count})`,
    collapseUpdates: "Show less",
    closeNotice: "Close",
    prevNotice: "Previous update",
    nextNotice: "Next update",
    noAnnouncements: "No announcements right now.",
    promoAlt: "Colorful 3D packaging mockups",
    promoTag: "Studio 3D",
    promoTitle: "Render more. Pay less.",
    promoDescVietnam: "Instant VietQR coin top-up with automatic credit confirmation.",
    promoDescInternational: "Instant coin top-up via Card, Apple Pay, or Google Pay.",
    promoCta: "Open Studio",
    promoDotsAria: "Promotion slides",
    rightColumnAria: "Account and daily rewards",
    checkinTitle: "Daily check-in",
    checkinPausedDesc: "Daily check-in is temporarily paused",
    checkinStreakDesc: (streak) => `${streak}-day streak · Missing a day resets to Day 1`,
    checkinDefaultDesc: "Check in daily — missing a day resets to Day 1",
    checkinGroupAria: "Seven day check-in progress",
    dayLabel: (day) => `Day ${day}`,
    today: "Today",
    dayAria: (dayLabel, coins, completed) =>
      `${dayLabel}, ${coins} coins${completed ? ", claimed" : ""}`,
    checkinPausedCta: "Check-in paused",
    checkinClaimedCta: (reward) => `Reward claimed (+${reward})`,
    checkinClaimCta: (reward) => `Claim today's +${reward}`,
    checkinPausedBadge: "Paused",
    checkinClaimedBadge: (reward) => `Claimed +${reward}`,
    checkinTapTodayBadge: (reward) => `Tap Today +${reward}`,
    feedbackTitle: "Send feedback",
    feedbackCategoryAria: "Select feedback category",
    feedbackCatIdea: "Idea",
    feedbackCatBug: "Bug",
    feedbackCatModel: "3D Model",
    feedbackPlaceholder: "Share an idea, report a bug, or request a new 3D mockup...",
    feedbackEmailPlaceholder: "Contact email (optional)",
    feedbackAsUser: (name) => `Sending as ${name}`,
    feedbackLoginPrompt: "Sign in to send feedback directly to the HyperMockup team.",
    feedbackLoginBtn: "Sign in to send feedback",
    feedbackQuotaHint: "Up to 10/day · 2 min between messages",
    feedbackCooldown: (seconds) => `Please wait ${seconds}s before sending another message.`,
    feedbackCooldownBtn: (countdown) => `Wait ${countdown}`,
    feedbackDailyLimit: (limit) => `You reached today's limit of ${limit} messages. Please try again tomorrow.`,
    feedbackSend: "Send",
    feedbackSending: "Sending...",
    feedbackSentTitle: "Feedback sent!",
    feedbackSentDesc: "Thank you — our team has received your message.",
    feedbackSendAnother: "Send another",
    feedbackTooShort: "Please enter at least 3 characters.",
    feedbackInvalidEmail: "Please enter a valid email address.",
    feedbackInvalidInput: "Invalid feedback input.",
    feedbackRateLimit: "Too many submissions. Please try again in a few minutes.",
    feedbackFailed: "Could not send feedback right now. Please try again.",
    defaultUpdates: [
      { tone: "mint", title: "Parametric 3D CAD Boxes: FEFCO 0201, 0201E & Honeycomb Dividers", time: "26/11/2026", unread: true },
      { tone: "blue", title: "HDRI + Spotlight Rig, Cloud Projects & 3D Share Links", time: "26/11/2026", unread: true },
      { tone: "pink", title: "7-Day Check-In Streak: Claim Free Studio Coins Daily", time: "26/11/2026", unread: false },
    ],
  },
  pricing: {
    title: "Coin packages",
    subtitleVietnam: (amount) => `Render 3D images and other useful tools from just 5 coins, equivalent to only ${amount} VND.`,
    subtitleInternational: (amount) => `Render 3D images and other useful tools from just 5 coins, equivalent to only ${amount}.`,
    regionSwitchAria: "Pricing region (Admin preview)",
    regionVietnam: "Vietnam",
    regionInternational: "International",
    activeCurrencyAria: "Active payment currency",
    singleVietnamTitle: "Vietnam · VND (VietQR)",
    singleInternationalTitle: "International · USD",
    singleInternationalSub: "Polar.sh Merchant of Record",
    packsAria: (regionLabel) => `${regionLabel} coin packages`,
    badgePopular: (bonusPct) => `Popular · +${bonusPct}%`,
    badgeBest: (bonusPct) => `Best · +${bonusPct}%`,
    badgeBonus: (bonusPct) => `+${bonusPct}% bonus`,
    badgeStarter: "Starter",
    packAria: (coinsFormatted, bonusPct, price) =>
      `${coinsFormatted} coins${bonusPct ? `, +${bonusPct}% bonus` : ""}, ${price}`,
    closeCheckoutAria: "Close top-up panel",
    eyebrowPolar: "International Top-Up · USD",
    eyebrowSepay: "Domestic Top-Up · VND",
    checkoutTitle: (coinsFormatted) => `Top up ${coinsFormatted} coins`,
    descPolar: (sandbox) =>
      `Pay securely with Visa, Mastercard, Apple Pay, or Google Pay via Polar${sandbox ? " (Sandbox)" : ""}`,
    descSepayQr: "Scan VietQR with your banking app — coins credit automatically right after transfer",
    descSepayGateway: (sandbox) =>
      sandbox ? "Pay with VietQR via SePay (Test Mode)" : "Pay with VietQR via SePay",
    chooseMethod: "Choose method",
    paymentMethodAria: "Payment method",
    methodGpay: "Google Pay",
    methodCard: "Card",
    methodBank: "Bank",
    polarSafe: "Inline Polar Checkout · No redirect",
    polarTitlePaid: "Payment confirmed!",
    polarTitleSandbox: "Polar Sandbox · Inline",
    polarTitleReady: "Instant inline checkout",
    polarSubPaid: "Your coins have been credited to your account.",
    polarSubCountdown: (countdown) => `Session valid for ${countdown}`,
    polarSubHint: "Select a method above to open checkout right on this page.",
    qrLoading: "Loading QR…",
    qrAlt: (coins, bankName) => `Payment QR code for ${coins} coins via ${bankName}`,
    qrPaidAria: "Payment completed",
    qrPaidLabel: "Coins added",
    qrExpiredAria: "QR code expired",
    qrExpiredLabel: "Expired",
    qrSuccessTitle: "Payment successful!",
    qrSuccessSub: "Your coin balance has been updated.",
    qrCountdownSub: (countdown) => `Scan with any Vietnam banking app · Expires in ${countdown}`,
    qrExpiredSub: "Click Generate new QR if you haven't transferred yet.",
    qrWebhookSub: "Coins are credited automatically once SePay webhook confirms payment.",
    qrCreating: "Creating QR code…",
    qrSepayTitle: "SePay VietQR",
    qrSignInTitle: "Sign in to view QR",
    qrInitializingSub: "Generating VietQR from server…",
    qrAreaAria: "SePay VietQR payment area",
    summaryPack: "Coin pack",
    summaryPrice: "Price",
    summaryProvider: "Provider",
    summaryMethods: "Methods",
    summaryMethodsValue: "Card · Apple Pay · Google Pay",
    summaryOrderId: "Order ID",
    summaryBank: "Bank",
    summaryAccountNo: "Account no.",
    summaryAccountOwner: "Account holder",
    summaryTransferContent: "Transfer note",
    summaryMethod: "Method",
    summaryMethodQr: "Bank QR transfer",
    summaryStatus: "Status",
    copyAccountAria: "Copy bank account number",
    copyContentAria: "Copy transfer note",
    copied: "Copied",
    copy: "Copy",
    statusPaid: "Paid · coins added",
    statusConfirming: "Confirming payment…",
    statusExpired: "Session expired",
    statusLoadingPolar: "Preparing Polar checkout…",
    statusLoadingSepay: "Creating QR code…",
    statusReadyPolar: "Ready · Pay inline without leaving site",
    statusReadySepay: "Awaiting transfer · auto coin credit",
    statusIdlePolar: "Ready to checkout",
    statusIdleSepay: "Not started",
    actionPaidClose: (coinsFormatted) => `Added ${coinsFormatted} coins · Close`,
    actionOpeningCheckout: "Opening checkout…",
    actionPayNow: (price) => `Pay ${price} now`,
    actionChecking: "Checking…",
    actionCheckStatus: "Check status",
    actionOpenNewTab: "Open in new tab",
    actionDownloadQr: "Download QR",
    actionTransferred: "I've transferred",
    actionPreparingCheckout: "Preparing checkout…",
    actionNewCheckout: "Create new checkout",
    actionNewQr: "Generate new QR",
    actionOpenQr: "Open payment QR",
    actionContinuePolar: (price) => `Continue to Polar (${price})`,
    actionCreateQr: "Generate payment QR",
    actionSignInToBuy: "Sign in to buy coins",
    receiptSummary: "Receipt / Invoice details (optional)",
    receiptBuyerPlaceholder: "Full name or Company name",
    receiptTaxPlaceholder: "Tax ID (optional)",
    receiptEmailPlaceholder: "Email for receipt",
    receiptAddressPlaceholder: "Billing / contact address",
    receiptHint: "Saved with your order code for personal tax receipt/invoice reconciliation.",
    receiptSaving: "Saving…",
    receiptSave: "Save details",
    receiptSaved: "Receipt details saved for this order.",
    receiptInvalid: "Please enter at least one valid field (and a valid email format if provided).",
    receiptSaveFailed: "Could not save receipt details.",
    policyHeading: "Payment & Tax Policy",
    policyPolar:
      "Purchased Coins do not expire while your account is active, are non-transferable, have no cash value, and credit automatically via signed Polar webhooks. Applicable VAT/Sales Tax is handled by Polar.sh as Merchant of Record (exclusive to customers outside Vietnam).",
    policySepay:
      "VND prices include applicable taxes under Vietnam regulations. Coins are internal service credits with no cash value, non-transferable, and do not expire while your account remains active. Please keep the exact amount and transfer note.",
    linkTerms: "Terms",
    linkRefund: "Payment & Refunds",
    linkPrivacy: "Privacy",
    linkComplaints: "Complaints & IP",
    errRegionRestricted:
      "Under Vietnam foreign exchange rules (Circular 32/2013/TT-NHNN), visitors in Vietnam must pay in VND via VietQR.",
    errSignInRequired: "Please sign in before purchasing coins.",
    errPolarNotConfigured: "International card checkout (Polar.sh) is being configured on the server.",
    errSepayNotConfigured: "SePay payment gateway is not configured on the server yet.",
    errPolarFailed: "Could not initialize Polar checkout session. Please try again.",
    errSepayMismatch: "SePay environment configuration (Sandbox/Production) does not match the merchant key.",
    errPublicUrlRequired: "A public HTTPS URL is required for payment webhook callbacks.",
    errCreateOrderFailed: "Could not create checkout order. Please try again.",
    errEmbedOpenFailed: "Could not open inline checkout popup. You can use the direct Polar link below.",
    hintPendingPolar: "Payment not received yet — coins will credit automatically right after Polar confirms your card payment.",
    hintPendingSepay: "Transfer not received yet — coins credit automatically a few seconds after bank transfer.",
  },
  auth: {
    loginTitle: "Login",
    loginAction: "Login",
    registerTitle: "Create account",
    registerAction: "Create account",
    forgotEyebrow: "LET’S GET YOU BACK IN",
    forgotTitle: "Reset your password",
    forgotDescription: "Send a 6-digit code to your email, then set a new password.",
    forgotAction: "Reset password",
    closeAria: "Close account dialog",
    googleConnecting: "Connecting to Google…",
    googleContinue: "Continue with Google",
    googleUnavailable: "Google sign-in is not available yet. Please try again later.",
    googleConnectError: "Unable to connect to Google sign-in. Please try again.",
    googleOauthFailed: "Google sign-in could not be completed. Please try again.",
    dividerEmail: "or continue with email",
    nameLabel: "Your name",
    namePlaceholder: "Your display name",
    emailLabel: "Email address",
    emailPlaceholder: "you@example.com",
    codeLabel: "Email verification code",
    codePlaceholder: "Enter 6-digit code",
    sending: "Sending…",
    resendIn: (seconds) => `Resend in ${seconds}s`,
    resendCode: "Resend code",
    sendCode: "Send code",
    codeSentHint: (email) => `We sent a 6-digit code to ${email}. Check Spam if you don’t see it.`,
    codePromptHint: "Click Send code to receive a 6-digit verification code by email.",
    passwordLabel: "Password",
    newPasswordLabel: "New password",
    forgotPasswordLink: "Forgot password?",
    passwordLoginPlaceholder: "Enter your password",
    passwordForgotPlaceholder: "Create a new password",
    passwordRegisterPlaceholder: "Create a password",
    showPasswordAria: "Show password",
    hidePasswordAria: "Hide password",
    passwordHint: "Use at least 12 characters with letters and numbers.",
    consentPrefix: "I agree to the ",
    consentTerms: "Terms of Service",
    consentAnd: " and ",
    consentPrivacy: "Personal Data Protection Policy",
    consentSuffix:
      " (including account data storage/processing on international cloud infrastructure such as Cloudflare, Google, and our OTP email provider).",
    consentRequiredError: "Please agree to the Terms of Service and Personal Data Protection Policy before signing up.",
    loginLegalPrefix: "By signing in, you agree to our ",
    loginLegalTerms: "Terms",
    loginLegalPrivacy: "Privacy Policy",
    pleaseWait: "Please wait…",
    backToLogin: "Back to login",
    newToBrand: "New to HyperMockup?",
    alreadyHaveAccount: "Already have an account?",
    createAccountLink: "Create an account",
    loginLink: "Login",
    valNameRequired: "Enter your name.",
    valEmailRequired: "Enter your email address.",
    valEmailInvalid: "Enter a valid email address.",
    valCodeInvalid: "Enter the 6-digit code sent to your email.",
    valPasswordRequired: "Enter your password.",
    valPasswordWeak: "Use at least 12 characters with letters and numbers.",
    errInvalidCredentials: "The email or password is incorrect.",
    errEmailExists: "This email is already registered. Try logging in instead.",
    errInvalidCode: "The 6-digit verification code is incorrect.",
    errCodeExpired: "The verification code has expired. Please request a new code.",
    errCodeTooMany: "Too many incorrect code attempts. Please request a new code.",
    errCooldown: "Please wait a moment before requesting another code.",
    errRateLimit: "Too many attempts. Please wait a bit before trying again.",
    errEmailNotConfigured: "Email verification service is not configured on the server yet.",
    errEmailSendFailed: "Could not send the verification email. Please try again in a moment.",
    errRegistrationsDisabled: "New account registrations are currently paused.",
    errConsentRequired: "Please agree to the Terms of Service and Personal Data Protection Policy before creating an account.",
    errInvalidInputLogin: "Please check your email and password.",
    errInvalidInputOther: "Use a valid email, 6-digit code, and a 12+ character password with letters and numbers.",
    errGeneric: "Account access could not be completed. Please try again.",
  },
  profile: {
    ariaLabel: "Your profile",
    eyebrow: "Your profile",
    viewNotificationsAria: (count) => `View ${count} notifications`,
    accountDetailsAria: "Account details",
    signInAria: "Sign in",
    yourAccount: "Your account",
    guestAccount: "Guest account",
    signedIn: "Signed in",
    guestSubtitle: "Sign in to sync coins & rewards",
    daysCheckedIn: "Days checked in",
    daysUnit: "days",
    coinBalance: "Coin balance",
    signInShort: "Sign in",
    badges: "Badges",
    defaultBadge: "Starter",
    recentActivity: "Recent coin activity",
    downloadStatement: "Statement",
    downloadingStatement: "Exporting…",
    downloadStatementAria: "Download coin activity statement (CSV)",
    emptyActivity: "Your recent coin activity will appear here.",
    guestPromptVietnam: "Sign in to claim daily coins, top up via VietQR, and sync your 3D studio balance.",
    guestPromptInternational: "Sign in to claim daily coins, top up by card, and sync your 3D studio balance.",
    guestPromptAria: "Sign in to your account",
    login: "Login",
    createAccount: "Create account",
    coinsAria: (amount) => `${amount} coins`,
    entryWelcome: "Welcome bonus",
    entryLaunchPromo: "Launch event bonus",
    entryCheckin: "Daily check-in",
    entryPurchase: "Coin purchase",
    entryAdmin: "Admin adjustment",
    entryRefund: "Refund",
    entryDieline: "Dieline export (1:1 mm)",
    entryRender: "Image render",
    entryDielineRefund: "Dieline refund",
    entryRenderRefund: "Render refund",
    entryReward: "Coin reward",
    entrySpend: "Coin spend",
    minutesAgo: (n) => `${n}m ago`,
    hoursAgo: (n) => `${n}h ago`,
    daysAgo: (n) => `${n}d ago`,
  },
  footer: {
    ariaLabel: "Legal information and terms",
    linksAria: "Legal links",
    ownerSummaryNamed: (name, taxId) => `Owner: ${name}${taxId ? ` · Tax ID: ${taxId}` : ""}`,
    ownerSummaryFallback: "Individual business operator (Vietnam)",
    ownerInfoButton: "Owner info",
    about: "About",
    contact: "Contact",
    terms: "Terms",
    privacy: "Privacy",
    refund: "Payment & Refunds",
    complaints: "Complaints & IP",
    moitBadge: "MOIT Notified",
    emailAria: (email) => `Email support at ${email}`,
    modalCloseAria: "Close website owner details dialog",
    modalTitle: "Website Owner Information",
    modalIntro:
      "Public operator disclosure under Vietnam Law on E-Commerce 122/2025/QH15 and Decree 248/2026/ND-CP (individual business operator in Vietnam).",
    labelOwner: "Individual Owner",
    labelTaxId: "Personal Tax ID (MST)",
    labelAddress: "Contact Address",
    labelPhone: "Support Phone",
    labelEmail: "Support & Complaints Email",
    labelDomain: "Official Domain",
    pendingOwner: "Pending setup in Admin → Legal & Tax",
    pendingGeneric: "Pending setup",
    pendingAddress: "Vietnam (pending setup)",
    termsFull: "Terms of Service",
  },
  cookie: {
    ariaLabel: "Cookie and personal data notice",
    title: "Cookies & Data Privacy",
    copyPrefix:
      "HyperMockup uses essential cookies to keep your sign-in secure and optional aggregated analytics if you consent. Learn more in our ",
    privacyLink: "Personal Data Protection Policy",
    essentialBtn: "Essential only",
    acceptBtn: "Accept analytics",
  },
  paymentResult: {
    sepayEyebrow: "HYPERMOCKUP · SEPAY",
    sepayTitlePaid: "Coins added successfully",
    sepayTitleConfirming: "Confirming your payment",
    sepayTitleCancel: "Payment cancelled",
    sepayTitleError: "Payment incomplete",
    sepayChecking: "SePay is sending payment confirmation. Coins are credited once our server receives the signed webhook.",
    sepayDelayed:
      "Confirmation has not arrived yet. Please check your wallet again in a few minutes or contact support with your order code.",
    sepayCredited: (coins) => `+${coins.toLocaleString("en-US")} coins have been added to your account.`,
    polarEyebrow: "HYPERMOCKUP · POLAR INTERNATIONAL",
    polarTitlePaid: "Payment successful!",
    polarTitleConfirming: "Confirming your payment…",
    polarTitleCancel: "Checkout cancelled",
    polarChecking: "Polar is sending the verified payment webhook. Your coins will appear automatically in a few seconds.",
    polarDelayed:
      "Still waiting for confirmation. Please check your wallet on the home page in a moment or contact support with your order code.",
    polarCredited: (coins) => `+${coins.toLocaleString("en-US")} coins have been added to your account!`,
    orderCodeLabel: "Order code:",
    backHome: "Back to Home",
    openStudio: "Open Studio",
    notFoundTitle: "Order not found",
  },
  studio: EN_STUDIO_MESSAGES,
};

export const UI_MESSAGES: Record<UiLocale, UiMessages> = {
  vi: VI_MESSAGES,
  en: EN_MESSAGES,
};

export function getUiMessages(locale: UiLocale): UiMessages {
  return UI_MESSAGES[locale] ?? VI_MESSAGES;
}
