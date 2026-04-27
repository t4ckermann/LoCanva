function q<T extends HTMLElement>(id: string): T {
    return document.getElementById(id) as T;
}

function maybe<T extends HTMLElement>(id: string): T | null {
    return document.getElementById(id) as T | null;
}

function generateUI() {
    return {
        themeToggle:     q<HTMLButtonElement>  ("theme-toggle"),
        prompt:          q<HTMLTextAreaElement>("prompt"),
        generateBtn:     q<HTMLButtonElement>  ("generate-btn"),
        optimizeOnlyBtn: q<HTMLButtonElement>  ("optimize-only-btn"),
        promptBar:       q<HTMLDivElement>     ("prompt-bar"),
        textareaWrap:    q<HTMLDivElement>     ("textarea-wrap"),
        textareaExpandBtn: q<HTMLButtonElement>("textarea-expand-btn"),
        imageContainer:  q<HTMLDivElement>     ("image-container"),
        generatedImage:  q<HTMLImageElement>   ("generated-image"),
        loadingOverlay:  q<HTMLDivElement>     ("loading-overlay"),
        loadingMsg:      q<HTMLSpanElement>    ("loading-msg"),
        errorMsg:        q<HTMLDivElement>     ("error-msg"),
        enhanceBtn:      q<HTMLButtonElement>  ("enhance-btn"),
        fallbackMsg:     q<HTMLDivElement>     ("fallback-msg"),
        downloadBtn:     q<HTMLButtonElement>  ("download-btn"),
        driveUploadBtn:  q<HTMLButtonElement>  ("drive-upload-btn"),
        googleConnect:   maybe<HTMLAnchorElement>("google-connect"),
        googleDriveOk:   maybe<HTMLSpanElement> ("google-drive-ok"),
        aspectLand:        q<HTMLInputElement>   ("aspect-landscape"),
        aspectPort:        q<HTMLInputElement>   ("aspect-portrait"),
        aspectSquare:      q<HTMLInputElement>   ("aspect-square"),
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
        uploadZone:      q<HTMLDivElement>      ("upload-zone"),
        imageUpload:     q<HTMLInputElement>   ("image-upload"),
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
