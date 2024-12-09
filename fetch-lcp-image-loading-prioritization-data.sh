#!/bin/bash

set -e

# Check if a filename argument was provided
if [ -z "$1" ] || [ -z "$2" ]; then
  echo "Usage: $0 <filename> <outdir>"
  exit 1
fi

# Check if the file exists
if [ ! -f "$1" ]; then
  echo "Error: File '$1' not found."
  exit 1
fi
urlfile="$1"

# Check if the file exists
if [ ! -d "$2" ]; then
  echo "Error: Directory '$2' does not exist."
  exit 1
fi
outdir="$2"

# Iterate over each line in the file
while IFS= read -r url; do
	url=$( echo -n "$url" | tr -d '\r') # Normalize CRLF to LF line endings.
	hash=$(echo -n "$url" | md5sum | awk '{print $1}')
	outfile="$outdir/$hash.json"
	if [ -f "$outfile" ] && [ -s "$outfile" ]; then
		continue
	fi
	echo "Processing $url as $outfile"
	if npm run --silent research -- analyze-lcp-image-loading-prioritization -u "$url" > "$outfile"; then
		echo "$url" >> "$outdir/loaded.txt"
	else
		echo "FAILED"
		echo "$url" >> "$outdir/failed.txt"
	fi
	break
done < "$urlfile"

