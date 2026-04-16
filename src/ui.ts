function q<T extends HTMLElement>(id: string): T {
    return document.getElementById(id) as T;
}

function generateUI() {
    return {
        themeToggle:     q<HTMLButtonElement>  ("theme-toggle"),
        prompt:          q<HTMLTextAreaElement>("prompt"),
        generateBtn:     q<HTMLButtonElement>  ("generate-btn"),
        optimizeOnlyBtn: q<HTMLButtonElement>  ("optimize-only-btn"),
        promptBar:       q<HTMLDivElement>     ("prompt-bar"),
        promptToggle:    q<HTMLButtonElement>  ("prompt-toggle"),
        imageContainer:  q<HTMLDivElement>     ("image-container"),
        generatedImage:  q<HTMLImageElement>   ("generated-image"),
        loadingOverlay:  q<HTMLDivElement>     ("loading-overlay"),
        loadingMsg:      q<HTMLSpanElement>    ("loading-msg"),
        blockedMsg:      q<HTMLDivElement>     ("blocked-msg"),
        errorMsg:        q<HTMLDivElement>     ("error-msg"),
        enhanceBtn:      q<HTMLButtonElement>  ("enhance-btn"),
        fallbackMsg:     q<HTMLDivElement>     ("fallback-msg"),
        downloadBtn:     q<HTMLButtonElement>  ("download-btn"),
    };
}

function describeUI() {
    return {
        historyPanel:    q<HTMLDivElement>     ("history-panel"),
        historyToggle:   q<HTMLButtonElement>  ("history-toggle"),
        historyCount:    q<HTMLSpanElement>    ("history-count"),
        historyList:     q<HTMLDivElement>     ("history-list"),
        tabGenerate:     q<HTMLButtonElement>  ("tab-generate"),
        tabDescribe:     q<HTMLButtonElement>  ("tab-describe"),
        generatePanel:   q<HTMLDivElement>     ("generate-panel"),
        describePanel:   q<HTMLDivElement>     ("describe-panel"),
        imageUpload:     q<HTMLInputElement>   ("image-upload"),
        uploadTriggerBtn: q<HTMLButtonElement> ("upload-trigger-btn"),
        uploadPreview:   q<HTMLImageElement>   ("upload-preview"),
        describeBtn:     q<HTMLButtonElement>  ("describe-btn"),
        useAsPromptBtn:  q<HTMLButtonElement>  ("use-as-prompt-btn"),
        describeResult:  q<HTMLDivElement>     ("describe-result"),
    };
}

export function buildUI() {
    return { ...generateUI(), ...describeUI() };
}

export type UI = ReturnType<typeof buildUI>;
