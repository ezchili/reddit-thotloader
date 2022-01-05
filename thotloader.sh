for user in "$@"
do
	mkdir -p tmp
	mkdir -p downloads/${user}/
	node.exe thotloader.js "${user}"; (find tmp/ -type f -print0 | xargs -0 md5sum -b | sort | uniq -w32 | cut -c35- | xargs -d "\n" -I@ mv "@" downloads/${user}/ ) && rm -f tmp/*
done
rmdir tmp
