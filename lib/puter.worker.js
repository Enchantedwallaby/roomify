const PROJECT_PREFIX = 'plan2reality_project_';
const GLOBAL_FEED_KEY = 'plan2reality_global_feed';
const MAX_FEED_SIZE = 100;

const jsonError = (status, message, extra = {}) => {
    return new Response(JSON.stringify({ error: message, ...extra }), {
        status,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
        },
    });
};

const getAuthUser = async (userPuter) => {
    try {
        const user = await userPuter.auth.getUser();
        return {
            userId: user?.uuid || null,
            username: user?.username || null,
        };
    } catch {
        return { userId: null, username: null };
    }
};

const hasRenderedOutput = (project) =>
    !!project?.renderedImage &&
    typeof project.renderedImage === 'string' &&
    project.renderedImage.length > 0;

const sortByTimestamp = (projects) =>
    [...projects]
        .filter((project) => !!project?.id && hasRenderedOutput(project))
        .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

const mergeProjectsById = (projectLists) => {
    const byId = new Map();

    for (const list of projectLists) {
        for (const project of list) {
            if (!project?.id || !hasRenderedOutput(project)) continue;
            const existing = byId.get(project.id);
            byId.set(project.id, {
                ...(existing || {}),
                ...project,
                isPublic: true,
            });
        }
    }

    return sortByTimestamp([...byId.values()]);
};

const readGlobalFeed = async (me) => {
    if (!me?.puter) return [];
    try {
        const feed = await me.puter.kv.get(GLOBAL_FEED_KEY);
        return Array.isArray(feed) ? feed : [];
    } catch {
        return [];
    }
};

const writeGlobalFeed = async (me, projects) => {
    if (!me?.puter) return;
    await me.puter.kv.set(GLOBAL_FEED_KEY, sortByTimestamp(projects).slice(0, MAX_FEED_SIZE));
};

const upsertGlobalFeed = async (me, project) => {
    if (!hasRenderedOutput(project)) return;

    const feed = await readGlobalFeed(me);
    const without = feed.filter((entry) => entry.id !== project.id);
    without.unshift({
        ...project,
        isPublic: true,
        sharedAt: project.sharedAt || new Date().toISOString(),
    });
    await writeGlobalFeed(me, without);
};

router.post('/api/projects/save', async ({ request, user, me }) => {
    try {
        const userPuter = user.puter;

        if (!userPuter) return jsonError(401, 'Authentication failed');

        const body = await request.json();
        const project = body?.project;

        if (!project?.id || !project?.sourceImage) {
            return jsonError(400, 'Project ID and source image are required');
        }

        const { userId, username } = await getAuthUser(userPuter);
        if (!userId) return jsonError(401, 'Authentication failed');

        const payload = {
            ...project,
            ownerId: project.ownerId || userId,
            sharedBy: project.sharedBy || username || 'Community member',
            isPublic: hasRenderedOutput(project),
            updatedAt: new Date().toISOString(),
        };

        await userPuter.kv.set(`${PROJECT_PREFIX}${project.id}`, payload);

        if (hasRenderedOutput(payload)) {
            await upsertGlobalFeed(me, payload);
        }

        return { saved: true, id: project.id, project: payload };
    } catch (e) {
        return jsonError(500, 'Failed to save project', {
            message: e.message || 'Unknown error',
        });
    }
});

router.get('/api/projects/list', async ({ user, me }) => {
    try {
        const userPuter = user.puter;
        if (!userPuter) return jsonError(401, 'Authentication failed');

        const { userId } = await getAuthUser(userPuter);
        if (!userId) return jsonError(401, 'Authentication failed');

        const globalFeed = await readGlobalFeed(me);

        const userProjects = (await userPuter.kv.list(PROJECT_PREFIX, true))
            .map(({ value }) => value)
            .filter(Boolean);

        const userRendered = userProjects.filter(hasRenderedOutput);

        for (const project of userRendered) {
            await upsertGlobalFeed(me, {
                ...project,
                ownerId: project.ownerId || userId,
            });
        }

        const refreshedFeed = await readGlobalFeed(me);

        const projects = mergeProjectsById([refreshedFeed, globalFeed, userRendered]);

        return { projects };
    } catch (e) {
        return jsonError(500, 'Failed to list projects', {
            message: e.message || 'Unknown error',
        });
    }
});

router.get('/api/projects/get', async ({ request, user, me }) => {
    try {
        const userPuter = user.puter;
        if (!userPuter) return jsonError(401, 'Authentication failed');

        const { userId } = await getAuthUser(userPuter);
        if (!userId) return jsonError(401, 'Authentication failed');

        const url = new URL(request.url);
        const id = url.searchParams.get('id');

        if (!id) return jsonError(400, 'Project ID is required');

        const globalFeed = await readGlobalFeed(me);
        let project = globalFeed.find((entry) => entry.id === id) || null;

        if (!project) {
            project = await userPuter.kv.get(`${PROJECT_PREFIX}${id}`);
        }

        if (!project) return jsonError(404, 'Project not found');

        if (hasRenderedOutput(project)) {
            await upsertGlobalFeed(me, project);
        }

        return { project };
    } catch (e) {
        return jsonError(500, 'Failed to get project', {
            message: e.message || 'Unknown error',
        });
    }
});
