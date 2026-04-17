const PROJECT_PREFIX = 'plan2reality_project_';
const jsonError=(status,message, extra={})=>{
    return new Response(JSON.stringify({error:message, ...extra}),{
        status,
        headers:{
            'content-type':'application/json',
            'Access-Control-Allow-Origin':'*'

        }
    })
}
const jsonResponse = (data, status = 200) =>
    new Response(JSON.stringify(data), {
        status,
        headers: {
            'content-type': 'application/json',
            'Access-Control-Allow-Origin': '*'
        }
    });

const getUserId = async (userPuter)=>{
    try{
        const user= await userPuter.auth.getUser();
        return user?.uuid || null;
    }catch {
        return null;
    }
}
router.post('/api/projects/save', async ({ request, user }) => {
    try{
        const userPuter= user.puter;
        if(!userPuter)
            return jsonError(401,'Authentication failed.');
        const body = await request.json();
        const project = body ?.project;
        const visibility = body?.visibility ?? 'private';
        if(!project?.id || !project?.sourceImage)
            return jsonError(400,'Missing required fields: id and sourceImage are required.');
        const payload = {
            ...project,
            updatedAt: new Date().toISOString(),
            visibility,
        }
        const userId = await getUserId(userPuter);
        if(!userId)
            return jsonError(401,'Authentication failed.');
        const key =`${PROJECT_PREFIX}${project.id}`;
        await userPuter.kv.set(key,payload);
        return jsonResponse({saved:true, id:project.id, project:payload});
    }catch (e) {
        return jsonError(500,'failed to save the project',{message:e.message || 'unknown error'});
    }
})

router.get('/api/projects/list', async ({ user }) => {
    try {
        const userPuter = user.puter;
        if (!userPuter) return jsonError(401, 'Authentication failed');

        const userId = await getUserId(userPuter);
        if (!userId) return jsonError(401, 'Authentication failed');

        const projects = (await userPuter.kv.list(PROJECT_PREFIX, true))
            .map(({value}) => ({ ...value, isPublic: true }))

        return jsonResponse({ projects });
    } catch (e) {
        return jsonError(500, 'Failed to list projects', { message: e.message || 'Unknown error' });
    }
})
router.get('/api/projects/get', async ({ request, user }) => {
    try {
        const userPuter = user.puter;
        if (!userPuter) return jsonError(401, 'Authentication failed');

        const userId = await getUserId(userPuter);
        if (!userId) return jsonError(401, 'Authentication failed');

        const url = new URL(request.url);
        const id = url.searchParams.get('id');

        if (!id) return jsonError(400, 'Project ID is required');

        const key = `${PROJECT_PREFIX}${id}`;
        const project = await userPuter.kv.get(key);

        if (!project) return jsonError(404, 'Project not found');

        return jsonResponse({ project });
    } catch (e) {
        return jsonError(500, 'Failed to get project', { message: e.message || 'Unknown error' });
    }
})
