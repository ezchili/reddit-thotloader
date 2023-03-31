# reddit-thotloader

Parses reddit user profiles and asynchronously downloads the galleries, pictures and videos found there. Filters for duplicates, and scrape pictures from external webpages such as imgur posts/gifvs and redgifs. 

This uses a per-command cache to avoid downloading the same urls multiple times

In the event that you still download the same files multiple times, a shell script is included to detect and remove them.

## Usage:

* Shorthand shell script to remove duplicates:

```sh
alias node.exe=node
# I use this on Windows with Cygwin so bear with me
# You have to have "node.exe" in your path.
# Make sure that node outputs a tty (that you can pipe `node thotloader.js` to cat)
#    it's not obvious why but if I launch `node` instead of `node.exe`, I get the error "stdout is not a tty": https://stackoverflow.com/questions/45890339/stdout-is-not-a-tty-using-bash-for-node-tape-tap-spec
bash thotloader.sh reddit_username1 reddit_username2 reddit_usernameN
```

* Just download

```sh
node thotloader.js reddit_username
```

## Docker

Using Docker to run this program:

```sh
docker build -t reddit-thotloader:latest .
docker run -it \
    -v $PWD:$PWD \
    -u $(id -u):$(id -u) \
    reddit-thotloader:latest \
    bash -c "cd $PWD && node /usr/src/app/thotloader.js <reddit_username>"
```
