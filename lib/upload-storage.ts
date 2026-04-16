const UPLOAD_STORAGE_PREFIX = "upload:";

const isStorageAvailable = () => typeof window !== "undefined" && typeof window.localStorage !== "undefined";

export const getUploadStorageKey = (id: string) => `${UPLOAD_STORAGE_PREFIX}${id}`;

export const saveUploadedImage = (id: string, base64Image: string) => {
    if (!isStorageAvailable()) return false;

    window.localStorage.setItem(getUploadStorageKey(id), base64Image);
    return true;
};

export const loadUploadedImage = (id: string) => {
    if (!isStorageAvailable()) return null;

    const storedImage = window.localStorage.getItem(getUploadStorageKey(id));

    if (!storedImage?.startsWith("data:image/")) {
        return null;
    }

    return storedImage;
};
