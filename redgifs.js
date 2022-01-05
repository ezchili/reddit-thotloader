const HTMLParser = require('node-html-parser')
const http       = require('follow-redirects').https;

class Redgifs {
	async findMP4Link(url) {
		return new Promise( (resolve, reject) => {
			http.get(url, (res) => {
				const { statusCode } = res;
				const contentType = res.headers['content-type'];

				let error;
				// Any 2xx status code signals a successful response but
				// here we're only checking for 200.
				if (statusCode !== 200) {
					error = new Error('Request Failed.\n' +
														`Status Code: ${statusCode}` +
														`URL:         ${url}`);
				} else if (!/^text\/html/.test(contentType)) {
					error = new Error('Invalid content-type.\n' +
														`Expected text/html but received ${contentType}`);
				}

				if (error) {
					// Consume response data to free up memory
					res.resume();
					return reject(error);
				}

				res.setEncoding('utf8');
				let rawData = '';
				res.on('data', (chunk) => { rawData += chunk; });
				res.on('end', () => {
					try {
						let root = HTMLParser.parse(rawData);
						return resolve(
							root.querySelector("[property~='og:video'][content]")?.getAttribute("content")
						);
					} catch (e) {
						return reject(e)
					}
				});
			}).on('error', (e) => {
				return reject(e);
			});
		});
	}
}

module.exports = Redgifs