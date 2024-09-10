import psl from 'psl';
import basicAuth from 'basic-auth';

const API = 'https://api.vercel.com/';

export async function GET(request: Request) {
	const url = new URL(request.url);

	const hostname = url.searchParams.get('hostname');
	if (!hostname) {
		console.log('hostname query parameter not provided');
		return res('notfqdn');
	}

	const parsedPsl = psl.parse(hostname);
	if (parsedPsl.error) {
		console.log(
			`invalid hostname: ${parsedPsl.error.message} (${parsedPsl.error.code})`,
		);
		return res('notfqdn');
	}

	if (!parsedPsl.domain) {
		console.log('invalid hostname: no domain');
		return res('notfqdn');
	}

	if (!parsedPsl.subdomain) {
		console.log('invalid hostname: no subdomain');
		return res('notfqdn');
	}

	const ip = url.searchParams.get('myip');
	if (!ip) {
		console.log('myip query parameter not provided');
		return res('badrequest');
	}

	const auth = request.headers.get('authorization');
	if (!auth) {
		console.log('authorization header not provided');
		return res('badauth');
	}

	const parsedAuth = basicAuth.parse(auth);
	if (!parsedAuth) {
		console.log('invalid authorization header');
		return res('badauth');
	}

	const result = await update(
		parsedAuth.pass,
		parsedAuth.name,
		parsedPsl.subdomain,
		parsedPsl.domain,
		ip,
	);

	return res(result);
}

function res(body: string) {
	return new Response(body, {
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
	const headers = new Headers({ Authorization: `Bearer ${token}` });

	// Check if the DNS record already exists
	const GET_DNS = new URL(
		`/v4/domains/${encodeURIComponent(domain)}/records?teamId=${teamId}&limit=100`,
		API,
	);
	let res = await fetch(GET_DNS, { headers });
	if (!res.ok) {
		return 'badauth';
	}
	const data = await res.json();

	// TODO: handle pagination
	const existingRecord = data.records.find(
		(r) => r.name === hostname && r.type === 'A',
	);

	headers.set('Content-Type', 'application/json; charset=utf-8');
	const body = {
		type: 'A',
		name: hostname,
		value: ip,
		ttl: existingRecord?.ttl || 60,
		comment: existingRecord?.comment,
	};

	if (existingRecord) {
		if (existingRecord.value === ip) {
			console.log(
				`no change to existing record for ${hostname}.${domain}: ${ip}`,
			);
			return `nochg ${ip}`;
		}

		console.log(`updating existing record for ${hostname}.${domain}: ${ip}`);
		const PATCH_DNS = new URL(
			`/v1/domains/records/${encodeURIComponent(existingRecord.id)}?teamId=${teamId}`,
			API,
		);
		res = await fetch(PATCH_DNS, {
			method: 'PATCH',
			headers,
			body: JSON.stringify(body),
		});
	} else {
		console.log(`creating new record for ${hostname}.${domain}: ${ip}`);
		const POST_DNS = new URL(
			`/v2/domains/${encodeURIComponent(domain)}/records?teamId=${teamId}`,
			API,
		);
		res = await fetch(POST_DNS, {
			method: 'POST',
			headers,
			body: JSON.stringify(body),
		});
	}

	if (!res.ok) {
		const text = await res.text();
		console.log(
			`failed to update record for ${hostname}.${domain}: ${ip}: ${text}`,
		);
		return 'dnserr';
	}

	return `good ${ip}`;
}
