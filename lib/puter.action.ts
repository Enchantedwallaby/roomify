import {isHostedUrl} from "./utils";
import {PUTER_WORKER_URL} from "./constants";

const LOCAL_PROJECTS_KEY = "plan2reality_projects";
const MAX_LOCAL_PROJECTS = 20;

const createLocalProjectFallback = (item: DesignItem): DesignItem => ({
    ...item,
    isPublic: item.isPublic ?? false,
    ownerId: item.ownerId ?? null,
    timestamp: item.timestamp ?? Date.now(),
});

const getPuter = async () => (await import("@heyputer/puter.js")).default;

const isBrowser = () => typeof window !== "undefined";

const readLocalProjects = (): DesignItem[] => {
    if (!isBrowser()) return [];
    try {
        const raw = window.localStorage.getItem(LOCAL_PROJECTS_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw) as DesignItem[];
        if (!Array.isArray(parsed)) return [];
        return parsed.filter((project) => !!project?.id && !!project?.sourceImage);
    } catch {
        return [];
    }
};

const toStorageSafeProject = (project: DesignItem): DesignItem => {
    // Keep source image so visualizer can still render/regenerate.
    const sourceImage = project.sourceImage || "";
    const renderedImage = project.renderedImage && isHostedUrl(project.renderedImage)
        ? project.renderedImage
        : undefined;

    return {
        ...project,
        sourceImage,
        renderedImage,
    };
};

const normalizeStoredProjects = (projects: DesignItem[]) =>
    projects
        .map((project) => createLocalProjectFallback(project))
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, MAX_LOCAL_PROJECTS);

const writeLocalProjects = (projects: DesignItem[]): boolean => {
    if (!isBrowser()) return false;
    try {
        window.localStorage.setItem(LOCAL_PROJECTS_KEY, JSON.stringify(projects));
        return true;
    } catch {
        return false;
    }
};

const upsertLocalProject = (item: DesignItem): DesignItem => {
    const project = createLocalProjectFallback(item);
    const projects = normalizeStoredProjects(readLocalProjects());
    const existingIndex = projects.findIndex((p) => p.id === project.id);

    if (existingIndex >= 0) {
        projects[existingIndex] = project;
    } else {
        projects.unshift(project);
    }

    const normalized = normalizeStoredProjects(projects);
    if (writeLocalProjects(normalized)) return project;

    // Quota fallback: store only hosted URLs and drop bulky data URLs.
    const storageSafe = normalized.map(toStorageSafeProject);
    if (writeLocalProjects(storageSafe)) return project;

    // Last resort: keep only a small subset and drop rendered payloads.
    const minimal = storageSafe.slice(0, 5).map((p) => ({
        ...p,
        renderedImage: undefined,
    }));
    void writeLocalProjects(minimal);
    return project;
};

export const signIn = async () => {
    const puter = await getPuter();
    return await puter.auth.signIn();
};

export const signOut = async () => {
    const puter = await getPuter();
    return puter.auth.signOut();
};

export const getCurrentUser = async () => {
    try {
        const puter = await getPuter();
        return await puter.auth.getUser();
    } catch {
        return null;
    }
}

export const createProject = async ({ item, visibility = "private" }: CreateProjectParams): Promise<DesignItem | null | undefined> => {
    if(!PUTER_WORKER_URL) {
        return upsertLocalProject(item);
    }
    const puter = await getPuter();
    const { getOrCreateHostingConfig, uploadImageToHosting } = await import("./puter.hosting");
    const projectId = item.id;

    const hosting = await getOrCreateHostingConfig();

    const hostedSource = projectId ?
        await uploadImageToHosting({ hosting, url: item.sourceImage, projectId, label: 'source', }) : null;

    const hostedRender = projectId && item.renderedImage ?
        await uploadImageToHosting({ hosting, url: item.renderedImage, projectId, label: 'rendered', }) : null;

    const resolvedSource = hostedSource?.url || (isHostedUrl(item.sourceImage)
            ? item.sourceImage
            : ''
    );

    if(!resolvedSource) {
        console.warn('Failed to host source image, skipping save.')
        return null;
    }

    const resolvedRender = hostedRender?.url
        ? hostedRender?.url
        : item.renderedImage && isHostedUrl(item.renderedImage)
            ? item.renderedImage
            : undefined;

    const {
        sourcePath: _sourcePath,
        renderedPath: _renderedPath,
        publicPath: _publicPath,
        ...rest
    } = item;

    const payload = {
        ...rest,
        sourceImage: resolvedSource,
        renderedImage: resolvedRender,
    }

    try {
        const response = await puter.workers.exec(`${PUTER_WORKER_URL}/api/projects/save`, {
            method: 'POST',
            body: JSON.stringify({
                project: payload,
                visibility
            })
        });

        if(!response.ok) {
            console.error('failed to save the project', await response.text());
            return upsertLocalProject(payload as DesignItem);
        }

        const data = (await response.json()) as { project?: DesignItem | null }

        const remoteProject = data?.project ?? createLocalProjectFallback(payload as DesignItem);
        return upsertLocalProject(remoteProject);
    } catch (e) {
        console.log('Failed to save project', e)
        return upsertLocalProject(payload as DesignItem);
    }
}

export const getProjects = async () => {
    if(!PUTER_WORKER_URL) {
        return readLocalProjects();
    }

    try {
        const puter = await getPuter();
        const response = await puter.workers.exec(`${PUTER_WORKER_URL}/api/projects/list`, { method: 'GET' });

        if(!response.ok) {
            console.error('Failed to fetch history', await response.text());
            return readLocalProjects();
        }

        const data = (await response.json()) as { projects?: DesignItem[] | null };

        const projects = Array.isArray(data?.projects) ? data.projects : [];
        if (projects.length > 0) {
            void writeLocalProjects(normalizeStoredProjects(projects.map((p) => createLocalProjectFallback(p))));
            return projects;
        }
        return readLocalProjects();
    } catch (e) {
        console.error('Failed to get projects', e);
        return readLocalProjects();
    }
}

export const getProjectById = async ({ id }: { id: string }) => {
    if (!PUTER_WORKER_URL) {
        return readLocalProjects().find((project) => project.id === id) ?? null;
    }

    try {
        const puter = await getPuter();
        const response = await puter.workers.exec(
            `${PUTER_WORKER_URL}/api/projects/get?id=${encodeURIComponent(id)}`,
            { method: "GET" },
        );

        if (!response.ok) {
            console.error("Failed to fetch project:", await response.text());
            return readLocalProjects().find((project) => project.id === id) ?? null;
        }

        const data = (await response.json()) as {
            project?: DesignItem | null;
        };

        const project = data?.project ?? null;
        if (project) {
            upsertLocalProject(project);
            return project;
        }
        return readLocalProjects().find((localProject) => localProject.id === id) ?? null;
    } catch (error) {
        console.error("Failed to fetch project:", error);
        return readLocalProjects().find((project) => project.id === id) ?? null;
    }
};