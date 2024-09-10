export const config = {
	runtime: 'edge',
};

export default async function (request: Request) {
	return new Response(
		`Current IP Address: ${request.headers.get('x-real-ip')}`,
		{
			headers: {
				'content-type': 'text/html; charset=UTF-8',
			},
		},
	);
}
