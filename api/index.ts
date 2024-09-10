import psl from 'psl';
import basicAuth from 'basic-auth';

const API = 'https://api.vercel.com/';

export async function GET(request: Request) {
    const url = new URL(request.url);

    const hostname = url.searchParams.get('hostname');
    if (!hostname) {
        return new Response('no hostname', {
            status: 400,
            headers: {
                'content-type': 'text/plain',
            },
        });
    }

    const ip = url.searchParams.get('myip');
    if (!ip) {
        return new Response('no ip', {
            status: 400,
            headers: {
                'content-type': 'text/plain',
            },
        });
    }

    const auth = request.headers.get('authorization');
    if (!auth) {
        return new Response('no auth', {
            status: 401,
            headers: {
                'content-type': 'text/plain',
            },
        });
    }

    const parsedAuth = basicAuth.parse(auth);
    if (!parsedAuth) {
        return new Response('bad auth', {
            status: 401,
            headers: {
                'content-type': 'text/plain',
            },
        });
    }

    const parsedPsl = psl.parse(hostname);
    //console.log({ parsedPsl });

    if (parsedPsl.error) {
        return new Response(
            `bad hostname: ${parsedPsl.error.message} (${parsedPsl.error.code})`,
            {
                status: 400,
                headers: {
                    'content-type': 'text/plain',
                },
            },
        );
    }

    if (!parsedPsl.domain) {
        return new Response('bad hostname: no domain', {
            status: 400,
            headers: {
                'content-type': 'text/plain',
            },
        });
    }

    if (!parsedPsl.subdomain) {
        return new Response('bad hostname: no subdomain', {
            status: 400,
            headers: {
                'content-type': 'text/plain',
            },
        });
    }

    const result = await update(
        parsedAuth.pass,
        parsedAuth.name,
        parsedPsl.subdomain,
        parsedPsl.domain,
        ip,
    );

    return new Response(result, {
        headers: {
            'content-type': 'text/plain',
        },
    });
}

async function update(
    token: string,
    teamId: string,
    hostname: string,
    domain: string,
    ip: string,
): Promise<string> {
    const GET_DNS = new URL(
        `/v4/domains/${encodeURIComponent(domain)}/records?teamId=${teamId}&limit=100`,
        API,
    );
    const res = await fetch(GET_DNS, {
        headers: {
            Authorization: `Bearer ${token}`,
        },
    });
    if (!res.ok) {
        return 'badauth';
    }
    const data = await res.json();

    // TODO: handle pagination
    const existingRecord = data.records.find(
        (r) => r.name === hostname && r.type === 'A',
    );

    if (existingRecord) {
        //console.log('found existing record');

        if (existingRecord.value === ip) {
            //console.log('no change');
            return `nochg ${ip}`;
        }

        const PATCH_DNS = new URL(
            `/v1/domains/records/${encodeURIComponent(existingRecord.id)}?teamId=${teamId}`,
            API,
        );
        const body = {
            type: 'A',
            name: hostname,
            value: ip,
            ttl: existingRecord.ttl || 60,
            comment: existingRecord.comment,
        };
        const res = await fetch(PATCH_DNS, {
            method: 'PATCH',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        });
        //console.log(await res.json());
    } else {
        //console.log('creating new record');
        const POST_DNS = new URL(
            `/v2/domains/${encodeURIComponent(domain)}/records?teamId=${teamId}`,
            API,
        );
        const body = {
            type: 'A',
            name: hostname,
            value: ip,
            ttl: 60,
        };
        const res = await fetch(POST_DNS, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        });
        //console.log(await res.json());
    }
    return `good ${ip}`;
}
