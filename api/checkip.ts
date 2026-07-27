export async function GET(request: Request) {
	const headers = {
		'content-type': 'text/plain; charset=utf-8',
		'cache-control': 'private, no-store',
	};

	const ip = request.headers.get('x-real-ip');
	if (!ip) {
		// Without this, the body would read `Current IP Address: null` with a
		// `200`, and the client would report "unable to determine IP address"
		// with no indication of why.
		console.log('x-real-ip header not provided');
		return new Response('Unable to determine client IP address\n', {
			status: 500,
			headers,
		});
	}

	return new Response(`Current IP Address: ${ip}`, { headers });
}
