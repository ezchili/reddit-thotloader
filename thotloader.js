const fs     = require('fs');
const _url   = require("url");
const path   = require("path");
const assert = require("assert")

const http   = require('follow-redirects').https;
const sanitize = require("sanitize-filename");

const redgifs = require("./redgifs");

const SENTINEL_VALUE = "blop"

function extensionFromUrl(fileUrl) {
	let parsed = _url.parse(fileUrl);
	return path.extname(parsed.pathname);
}

function hostFromUrl(fileUrl) {
	let parsed = _url.parse(fileUrl);
	return parsed.hostname
}

async function wget(url, dir, filename, cache=undefined) {
	if (cache === undefined) {
		assert.fail("wget");
	}

	if (cache instanceof Array && cache.includes(url)) {
		console.error(`[CACHE][HIT] ${url}`)
		return Promise.resolve()
	}

	console.error(`[CACHE][MISS] ${url}`)
	if (filename) {
		dir += '/' + sanitize(filename)
	} else {
		dir = sanitize(dir)
	}

	const file = fs.createWriteStream(`${dir}`);

	if (cache instanceof Array) {
		cache.push(url)
	}

	return new Promise( (resolve, reject) => { 
		try {
			const request = http.get(url, (response) => {
				response.pipe(file);
				resolve();
			});
		} catch (e) {
			reject(e);
		}
	});	
}

async function get(url) {
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
			} else if (!/^application\/json/.test(contentType)) {
				error = new Error('Invalid content-type.\n' +
							`Expected application/json but received ${contentType}`);
			}
			if (error) {
				// Consume response data to free up memory
				res.resume();
				reject(error);
				return;
			}

			res.setEncoding('utf8');
			let rawData = '';
			res.on('data', (chunk) => { rawData += chunk; });
			res.on('end', () => {
				resolve({
					rawData,
					res
				});
			});
		}).on('error', (e) => {
			reject(e);
		});
	});
}

async function getFileUrlsFromRedditData(post, cache=[]) {
	assert.ok(cache[0] == SENTINEL_VALUE, "analyzeRedditPost")

	return new Promise( (resolve, reject) => {
		const host = hostFromUrl(post.data.url)
		let urls = [];

		// Hinted by reddit as "image" can reliably be straight up downloaded as an image
		if (["image"].includes(post.data.post_hint)) {
			urls.push(post.data.url)
		} 

		// Hinted by reddit as "video" usually has a useable link to an mp4
		else if (post.data.is_video) {
			if (post.data?.media?.reddit_video?.fallback_url) {
				urls.push(post.data?.media?.reddit_video?.fallback_url)
			} else {
				urls.push(`${post.data.url}/DASH_480.mp4`)
			}
		} 

		// If file extension is an image then we straight up download
		else if ([".jpg", ".png", ".gif", ".webm", ".mp4", ".mkv"].includes(extensionFromUrl(post.data.url))) {
			urls.push(post.data.url)
		} 

		// If imgur's gifv then we need to download the underlying mp4 which is thanksfully located at the same url every time
		else if ([".gifv"].includes(extensionFromUrl(post.data.url)) && ["i.imgur.com", "imgur.com"].includes(host)) {
			let parsed = _url.parse(post.data.url)
			let fname = path.parse(parsed.path).name
			urls.push(`https://i.imgur.com/${fname}.mp4`)
		} 

		// Weird video embeds often have a downloadable full-size video preview
		else if (typeof post.data.thumbnail === "string" && typeof (post.data.preview?.reddit_video_preview?.fallback_url) === "string") {
			urls.push(post.data.preview.reddit_video_preview.fallback_url)
		} 

		// Redgifs needs to perform further requests
		// Deferred to the redgifs module
		else if (["redgifs.com", "www.redgifs.com"].includes(host)) {
			return redgifs.findMP4Link(post.data.url).then( (url) => {
				return resolve(url);
			});
		} 

		// v.redd.it are redirections, we skip them. We don't deal with x-posts and reddit links.
		else if (["v.redd.it"].includes(host)) {
		} 

		// onlyfans links are straight up ignored
		else if (["onlyfans.com", "www.onlyfans.com"].includes(host)) {
		}

		return resolve(urls);
	});
}

async function analyzeRedditPost(child, {cache=[],recursion=0}) {
	assert.ok(cache[0] == SENTINEL_VALUE, "analyzeRedditPost")

	if (recursion > 1) {
		return Promise.resolve();
	}

	let pGatherMyUrls;
	if (child.data.is_gallery) {
		pGatherMyUrls = new Promise( (resolve, reject) => {
			let filesUrls = [];

			for (const i in child.data.media_metadata) {
				let v = child.data.media_metadata[i];

				if (v.e === "Image" /* && v.status === "valid" */) {
					if (v && v.s && typeof v.s.u == "string") {
						filesUrls.push(v.s.u.replace(/&amp;/g, "&"));
					} else {
						let error = new Error('Gallery v.s.u expected string, got\n' + typeof v.s.u + v.s.u);
						return reject(error);
					}
				} else {
					return reject(new Error(`Gallery v.e expected string 'Image' got "${v.e}", ${child.data.permalink}`));
				}
			}

			return resolve(filesUrls);
		});
	} else {
		pGatherMyUrls = getFileUrlsFromRedditData(child, cache);
	}

	let filesUrls = await pGatherMyUrls;

	// Error checking
	// By this point we should have an URL to download
	if ( (filesUrls instanceof Array) == false ) {
		console.error("[XX]", filesUrls, child.data.title, child.data.url, `https://old.reddit.com${child.data.permalink}`, child.data.post_hint)
		return Promise.reject(new Error("Expected filesUrls to be array, is " + typeof filesUrls + " instead."));
	}

	let dir = `tmp`
	if (!fs.existsSync(dir)) {
		fs.mkdirSync(dir);
	}

	for (const i in filesUrls) {
		const fileUrl = filesUrls[i];
		
		let id_extension = ""
		if (filesUrls.length > 1) {
			id_extension = ""+i;
		}

		try {
			let extension = extensionFromUrl(fileUrl);
			let pWget = wget(fileUrl, dir, `${child.data.title}_${child.data.id}${id_extension}${extension}`, cache)
			console.log("[OK]", fileUrl, child.data.title)

			return pWget;
		} catch (e) {
			console.error("[XX]", e.message, fileUrl, child.data.title, `https://old.reddit.com${child.data.permalink}`, child.data.post_hint)
			return Promise.reject(e);
		}
	}
}

async function sniff(orig_url, after="", cache=[]) {
	assert.ok(cache[0] == SENTINEL_VALUE, "sniff")
	let url = `${orig_url}?after=${after}`
	console.log(url);

	let {rawData, res} = await get(url)

	return new Promise( (resolve, reject) => {
		let parsedData;
		try {
			parsedData = JSON.parse(rawData);
		} catch(e) {
			return reject(e);
		}

		if (parsedData && parsedData.data) {
			let promPile = [];
			for (const child of parsedData.data.children) {
				const p = analyzeRedditPost(child, {cache:cache});

				promPile.push(p);
			}

			// Recursion
			if (typeof parsedData.data.after === "string") {
				// async Recursion
				let p = sniff(orig_url, parsedData.data.after, cache);
				promPile.push(p);
			} 

			return Promise.allSettled(promPile);
		} else {
			return reject(new Error(`Couldn't parse json, ${url}`));
		}
	})
}

if (process.argv[2] === undefined) {
	error = new Error("Arg user missing")
	console.error(error)
	return
}

let url = `https://old.reddit.com/user/${process.argv[2]}/submitted/.json`
sniff(url, undefined, [SENTINEL_VALUE]);
