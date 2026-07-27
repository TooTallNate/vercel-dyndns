export default async function (request: Request) {
	return new Response(
		`Current IP Address: ${request.headers.get('x-real-ip')}`,
		{
			headers: {
				'content-type': 'text/plain; charset=utf-8',
				'cache-control': 'private, no-store',
			},
		},
	);
}
