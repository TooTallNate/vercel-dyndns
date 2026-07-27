import * as tldts from 'tldts';
import * as basicAuth from 'basic-auth';

const API = 'https://api.vercel.com/';

const PAGE_SIZE = 100;

interface DNSRecord {
	id: string;
	name: string;
	type: string;
	value: string;
	ttl: number;
	comment?: string;
}

interface DNSRecordsResponse {
	records: DNSRecord[];
	pagination?: {
		count: number;
		next: number | null;
		prev: number | null;
	};
}

/**
 * Walks every page of the domain's DNS records looking for an existing `A`
 * record for `hostname`.
 *
 * The Vercel API paginates this listing with a `next` cursor (a timestamp
 * passed back as `until`). Only inspecting the first page means a domain with
 * more than `PAGE_SIZE` records can report "not found" for a record that does
 * exist, causing a duplicate `A` record to be created.
 */
async function findRecord(
	headers: Headers,
	teamId: string,
	domain: string,
	hostname: string,
): Promise<DNSRecord | undefined> {
	let until: number | null = null;

	do {
		const GET_DNS = new URL(
			`/v4/domains/${encodeURIComponent(domain)}/records`,
			API,
		);
		GET_DNS.searchParams.set('teamId', teamId);
		GET_DNS.searchParams.set('limit', String(PAGE_SIZE));
		if (until !== null) {
			GET_DNS.searchParams.set('until', String(until));
		}

		const res = await fetch(GET_DNS, { headers });
		if (!res.ok) {
			throw 'badauth';
		}
		const data = (await res.json()) as DNSRecordsResponse;

		const match = data.records.find(
			(r) => r.name === hostname && r.type === 'A',
		);
		if (match) return match;

		until = data.pagination?.next ?? null;
	} while (until !== null);

	return undefined;
}

export async function GET(request: Request) {
	let res = '';

	try {
		const url = new URL(request.url);

		const hostname = url.searchParams.get('hostname');
		if (!hostname) {
			console.log('hostname query parameter not provided');
			throw 'notfqdn';
		}

		const ip = url.searchParams.get('myip');
		if (!ip) {
			console.log('myip query parameter not provided');
			throw 'badrequest';
		}

		const auth = request.headers.get('authorization');
		if (!auth) {
			console.log('authorization header not provided');
			throw 'badauth';
		}

		const parsedAuth = basicAuth.parse(auth);
		if (!parsedAuth) {
			console.log('invalid authorization header');
			throw 'badauth';
		}

		// `dyndns2` specifies one result line per hostname, newline-separated.
		// A failure for one hostname must not prevent the remaining hostnames
		// from being updated, so per-host errors are collected rather than
		// thrown out of the loop.
		const results: string[] = [];

		for (const h of hostname.split(',')) {
			try {
				const parsedPsl = tldts.parse(h);

				if (!parsedPsl.domain) {
					console.log('invalid hostname: no domain');
					throw 'notfqdn';
				}

				if (!parsedPsl.subdomain) {
					console.log('invalid hostname: no subdomain');
					throw 'notfqdn';
				}

				await update(
					parsedAuth.pass,
					parsedAuth.name,
					parsedPsl.subdomain,
					parsedPsl.domain,
					ip,
				);

				results.push(`good ${ip}`);
			} catch (e: unknown) {
				if (typeof e !== 'string') throw e;
				// 'nochg <ip>' | 'notfqdn' | 'dnserr' | 'badauth'
				results.push(e);
			}
		}

		res = results.join('\n');
	} catch (e: unknown) {
		if (typeof e === 'string') {
			res = e;
		} else {
			throw e;
		}
	}

	// `dyndns2` clients read the status code from the response body, so every
	// response - including failures - is served with HTTP 200.
	return new Response(res, {
		status: 200,
		headers: {
			'content-type': 'text/plain; charset=utf-8',
			'cache-control': 'private, no-store',
		},
	});
}

async function update(
	token: string,
	teamId: string,
	hostname: string,
	domain: string,
	ip: string,
): Promise<void> {
	const headers = new Headers({ Authorization: `Bearer ${token}` });

	// Check if the DNS record already exists. The listing is paginated, so
	// every page must be walked - missing an existing record here would take
	// the "create" branch below and add a duplicate `A` record.
	const existingRecord = await findRecord(headers, teamId, domain, hostname);

	headers.set('Content-Type', 'application/json; charset=utf-8');
	let res: Response;
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
			throw `nochg ${ip}`;
		}

		console.log(
			`updating existing record for ${hostname}.${domain}: ${ip}`,
		);
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
		throw 'dnserr';
	}
}
