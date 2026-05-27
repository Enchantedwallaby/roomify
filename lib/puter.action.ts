import {isHostedUrl} from "./utils";
import {PUTER_WORKER_URL} from "./constants";

const LOCAL_PROJECTS_KEY = "plan2reality_projects";
const LOCAL_COMMUNITY_KEY = "plan2reality_community";
export const PROJECTS_UPDATED_EVENT = "plan2reality:projects-updated";

export const notifyProjectsUpdated = () => {
    if (!isBrowser()) return;
    window.dispatchEvent(new CustomEvent(PROJECTS_UPDATED_EVENT));
};
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

const readLocalCommunityProjects = (): DesignItem[] => {
    if (!isBrowser()) return [];
    try {
        const raw = window.localStorage.getItem(LOCAL_COMMUNITY_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw) as DesignItem[];
        if (!Array.isArray(parsed)) return [];
        return parsed.filter(
            (project) => !!project?.id && !!project?.renderedImage,
        );
    } catch {
        return [];
    }
};

const toStorageSafeProject = (project: DesignItem): DesignItem => {
    const sourceImage = project.sourceImage || "";
    const renderedImage =
        project.renderedImage && isHostedUrl(project.renderedImage)
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

const writeLocalCommunityProjects = (projects: DesignItem[]): boolean => {
    if (!isBrowser()) return false;

    const communityEntries = mergeCommunityProjects(projects).map((project) => ({
        id: project.id,
        name: project.name,
        renderedImage: project.renderedImage,
        sourceImage: isHostedUrl(project.sourceImage) ? project.sourceImage : "",
        timestamp: project.timestamp,
        ownerId: project.ownerId,
        sharedBy: project.sharedBy,
        sharedAt: project.sharedAt,
        isPublic: true,
    }));

    try {
        window.localStorage.setItem(
            LOCAL_COMMUNITY_KEY,
            JSON.stringify(communityEntries.slice(0, MAX_LOCAL_PROJECTS)),
        );
        return true;
    } catch {
        return false;
    }
};

const upsertLocalProject = (item: DesignItem): DesignItem => {
    const project = createLocalProjectFallback(item);

    if (hasRenderedOutput(project)) {
        publishLocalCommunityProject(project);
    }

    const projects = normalizeStoredProjects(readLocalProjects());
    const existingIndex = projects.findIndex((p) => p.id === project.id);

    if (existingIndex >= 0) {
        projects[existingIndex] = project;
    } else {
        projects.unshift(project);
    }

    const normalized = normalizeStoredProjects(projects);
    if (writeLocalProjects(normalized)) {
        return project;
    }

    const storageSafe = normalized.map(toStorageSafeProject);
    if (writeLocalProjects(storageSafe)) {
        return {
            ...project,
            renderedImage: project.renderedImage,
        };
    }

    const minimal = storageSafe.slice(0, 5).map((p) => ({
        ...p,
        renderedImage: undefined,
    }));
    void writeLocalProjects(minimal);
    return project;
};

const publishLocalCommunityProject = (item: DesignItem) => {
    if (!item.renderedImage) return;

    const project: DesignItem = {
        ...createLocalProjectFallback(item),
        isPublic: true,
        sharedAt: item.sharedAt || new Date().toISOString(),
    };

    const community = readLocalCommunityProjects();
    const existingIndex = community.findIndex((p) => p.id === project.id);

    if (existingIndex >= 0) {
        community[existingIndex] = project;
    } else {
        community.unshift(project);
    }

    writeLocalCommunityProjects(community);
    notifyProjectsUpdated();
};

const resolveVisibility = (
    visibility: CreateProjectParams["visibility"],
    renderedImage?: string | null,
) => (renderedImage ? "public" : visibility ?? "private");

const hasRenderedOutput = (project: DesignItem | null | undefined) =>
    !!project?.renderedImage && project.renderedImage.length > 0;

const mergeCommunityProjects = (...lists: DesignItem[][]) => {
    const byId = new Map<string, DesignItem>();

    for (const list of lists) {
        for (const project of list) {
            if (!project?.id || !hasRenderedOutput(project)) continue;
            const existing = byId.get(project.id);
            byId.set(project.id, {
                ...(existing || {}),
                ...createLocalProjectFallback(project),
                isPublic: true,
            });
        }
    }

    return [...byId.values()].sort((a, b) => b.timestamp - a.timestamp);
};

const resolveRenderedImage = (
    hostedUrl: string | null | undefined,
    original?: string | null,
) => hostedUrl || original || undefined;

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
};

export const publishRenderedProject = async (
    item: DesignItem,
): Promise<DesignItem> => {
    const user = await getCurrentUser();
    const project = createLocalProjectFallback({
        ...item,
        ownerId: item.ownerId ?? user?.uuid ?? null,
        sharedBy: item.sharedBy ?? user?.username ?? null,
        isPublic: true,
        sharedAt: item.sharedAt || new Date().toISOString(),
    });

    publishLocalCommunityProject(project);
    upsertLocalProject(project);
    notifyProjectsUpdated();

    if (PUTER_WORKER_URL) {
        void createProject({ item: project, visibility: "public" }).catch((error) => {
            console.warn("Background community sync failed:", error);
        });
    }

    return project;
};

const fetchProjectsFromPuterKv = async (): Promise<DesignItem[]> => {
    try {
        const puter = await getPuter();
        const entries = await puter.kv.list("plan2reality_project_", true);
        if (!Array.isArray(entries)) return [];

        return entries
            .map((entry) => entry?.value as DesignItem | undefined)
            .filter(
                (project): project is DesignItem =>
                    !!project && hasRenderedOutput(project),
            );
    } catch (error) {
        console.warn("Failed to read projects from Puter KV:", error);
        return [];
    }
};

export const createProject = async ({
    item,
    visibility = "private",
}: CreateProjectParams): Promise<DesignItem | null | undefined> => {
    const user = await getCurrentUser();
    const effectiveVisibility = resolveVisibility(visibility, item.renderedImage);

    const enrichedItem: DesignItem = {
        ...item,
        ownerId: item.ownerId ?? user?.uuid ?? null,
        sharedBy: item.sharedBy ?? user?.username ?? null,
        isPublic: effectiveVisibility === "public",
        sharedAt:
            effectiveVisibility === "public" && item.renderedImage
                ? item.sharedAt || new Date().toISOString()
                : item.sharedAt,
    };

    const localSaved = upsertLocalProject(enrichedItem);

    if (!PUTER_WORKER_URL) {
        return localSaved;
    }

    const puter = await getPuter();
    const { getOrCreateHostingConfig, uploadImageToHosting } = await import(
        "./puter.hosting"
    );
    const projectId = item.id;

    const hosting = await getOrCreateHostingConfig();

    const hostedSource = projectId
        ? await uploadImageToHosting({
              hosting,
              url: item.sourceImage,
              projectId,
              label: "source",
          })
        : null;

    const hostedRender =
        projectId && item.renderedImage
            ? await uploadImageToHosting({
                  hosting,
                  url: item.renderedImage,
                  projectId,
                  label: "rendered",
              })
            : null;

    const resolvedSource =
        hostedSource?.url ||
        (isHostedUrl(item.sourceImage) ? item.sourceImage : item.sourceImage);

    if (!resolvedSource) {
        console.warn("Failed to host source image, keeping local copy only.");
        return localSaved;
    }

    const resolvedRender = resolveRenderedImage(
        hostedRender?.url,
        item.renderedImage,
    );

    const {
        sourcePath: _sourcePath,
        renderedPath: _renderedPath,
        publicPath: _publicPath,
        ...rest
    } = enrichedItem;

    const payload = {
        ...rest,
        sourceImage: resolvedSource,
        renderedImage: resolvedRender,
        isPublic: !!resolvedRender || effectiveVisibility === "public",
    };

    try {
        const response = await puter.workers.exec(
            `${PUTER_WORKER_URL}/api/projects/save`,
            {
                method: "POST",
                body: JSON.stringify({
                    project: payload,
                    visibility: resolveVisibility(
                        effectiveVisibility,
                        resolvedRender,
                    ),
                }),
            },
        );

        if (!response.ok) {
            console.error("failed to save the project", await response.text());
            return upsertLocalProject(payload as DesignItem);
        }

        const data = (await response.json()) as { project?: DesignItem | null };

        const remoteProject =
            data?.project ?? createLocalProjectFallback(payload as DesignItem);
        const savedProject = upsertLocalProject({
            ...remoteProject,
            renderedImage: resolveRenderedImage(
                remoteProject.renderedImage,
                payload.renderedImage as string | undefined,
            ),
        });
        return savedProject;
    } catch (e) {
        console.log("Failed to save project", e);
        return upsertLocalProject(payload as DesignItem);
    }
};

const getMergedLocalRenderedProjects = () =>
    mergeCommunityProjects(
        readLocalCommunityProjects(),
        readLocalProjects().filter(hasRenderedOutput),
    );

const getAllRenderedProjects = async () => {
    const kvProjects = await fetchProjectsFromPuterKv();
    return mergeCommunityProjects(getMergedLocalRenderedProjects(), kvProjects);
};

export const syncRenderedProjectsToCommunity = async (): Promise<void> => {
    const user = await getCurrentUser();
    if (!user) return;

    const renderedProjects = mergeCommunityProjects(
        readLocalProjects().filter(hasRenderedOutput),
        await fetchProjectsFromPuterKv(),
    );

    if (renderedProjects.length === 0) return;

    for (const project of renderedProjects) {
        publishLocalCommunityProject({
            ...project,
            ownerId: project.ownerId ?? user.uuid ?? null,
            sharedBy: project.sharedBy ?? user.username ?? null,
            isPublic: true,
        });
    }

    await Promise.all(
        renderedProjects.map((project) =>
            createProject({
                item: {
                    ...project,
                    ownerId: project.ownerId ?? user.uuid ?? null,
                    sharedBy: project.sharedBy ?? user.username ?? null,
                    isPublic: true,
                },
                visibility: "public",
            }),
        ),
    );

    notifyProjectsUpdated();
};

export const getProjects = async (): Promise<DesignItem[]> => {
    const user = await getCurrentUser();
    if (!user) return [];

    const localAndKv = await getAllRenderedProjects();

    if (!PUTER_WORKER_URL) {
        return localAndKv;
    }

    try {
        const puter = await getPuter();
        const response = await puter.workers.exec(
            `${PUTER_WORKER_URL}/api/projects/list`,
            { method: "GET" },
        );

        if (!response.ok) {
            console.error("Failed to fetch community projects", await response.text());
            return localAndKv;
        }

        const data = (await response.json()) as { projects?: DesignItem[] | null };

        const remoteProjects = Array.isArray(data?.projects) ? data.projects : [];
        const projects = mergeCommunityProjects(remoteProjects, localAndKv);

        if (projects.length > 0) {
            writeLocalCommunityProjects(projects);
        }

        return projects;
    } catch (e) {
        console.error("Failed to get projects", e);
        return localAndKv;
    }
};

export const getProjectById = async ({ id }: { id: string }) => {
    const user = await getCurrentUser();
    if (!user) return null;

    if (!PUTER_WORKER_URL) {
        return (
            readLocalCommunityProjects().find((project) => project.id === id) ??
            readLocalProjects().find((project) => project.id === id) ??
            null
        );
    }

    try {
        const puter = await getPuter();
        const response = await puter.workers.exec(
            `${PUTER_WORKER_URL}/api/projects/get?id=${encodeURIComponent(id)}`,
            { method: "GET" },
        );

        if (!response.ok) {
            console.error("Failed to fetch project:", await response.text());
            return (
                readLocalCommunityProjects().find((project) => project.id === id) ??
                readLocalProjects().find((project) => project.id === id) ??
                null
            );
        }

        const data = (await response.json()) as {
            project?: DesignItem | null;
        };

        const project = data?.project ?? null;
        if (project) {
            upsertLocalProject(project);
            if (project.renderedImage) {
                publishLocalCommunityProject(project);
            }
            return project;
        }

        return (
            readLocalCommunityProjects().find((localProject) => localProject.id === id) ??
            readLocalProjects().find((localProject) => localProject.id === id) ??
            null
        );
    } catch (error) {
        console.error("Failed to fetch project:", error);
        return (
            readLocalCommunityProjects().find((project) => project.id === id) ??
            readLocalProjects().find((project) => project.id === id) ??
            null
        );
    }
};
