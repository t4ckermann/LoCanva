import { Controller } from "./controller.js";

const controller = new Controller({
    themeToggle:     document.getElementById("theme-toggle")       as HTMLButtonElement,
    prompt:          document.getElementById("prompt")             as HTMLTextAreaElement,
    generateBtn:     document.getElementById("generate-btn")       as HTMLButtonElement,
    optimizeOnlyBtn: document.getElementById("optimize-only-btn")  as HTMLButtonElement,
    promptBar:       document.getElementById("prompt-bar")         as HTMLDivElement,
    promptToggle:    document.getElementById("prompt-toggle")      as HTMLButtonElement,
    imageContainer:  document.getElementById("image-container")    as HTMLDivElement,
    generatedImage:  document.getElementById("generated-image")    as HTMLImageElement,
    loadingOverlay:  document.getElementById("loading-overlay")    as HTMLDivElement,
    loadingMsg:      document.getElementById("loading-msg")        as HTMLSpanElement,
    blockedMsg:      document.getElementById("blocked-msg")        as HTMLDivElement,
    errorMsg:        document.getElementById("error-msg")          as HTMLDivElement,
    enhanceBtn:      document.getElementById("enhance-btn")        as HTMLButtonElement,
    fallbackMsg:     document.getElementById("fallback-msg")       as HTMLDivElement,
    downloadBtn:     document.getElementById("download-btn")       as HTMLButtonElement,
    historyPanel:    document.getElementById("history-panel")      as HTMLDivElement,
    historyToggle:   document.getElementById("history-toggle")     as HTMLButtonElement,
    historyCount:    document.getElementById("history-count")      as HTMLSpanElement,
    historyList:     document.getElementById("history-list")       as HTMLDivElement,
    tabGenerate:     document.getElementById("tab-generate")       as HTMLButtonElement,
    tabDescribe:     document.getElementById("tab-describe")       as HTMLButtonElement,
    generatePanel:   document.getElementById("generate-panel")     as HTMLDivElement,
    describePanel:   document.getElementById("describe-panel")     as HTMLDivElement,
    imageUpload:     document.getElementById("image-upload")       as HTMLInputElement,
    uploadTriggerBtn: document.getElementById("upload-trigger-btn") as HTMLButtonElement,
    uploadPreview:   document.getElementById("upload-preview")     as HTMLImageElement,
    describeBtn:     document.getElementById("describe-btn")       as HTMLButtonElement,
    useAsPromptBtn:  document.getElementById("use-as-prompt-btn")  as HTMLButtonElement,
    describeResult:  document.getElementById("describe-result")    as HTMLDivElement,
});

controller.bindEvents();
controller.init();
