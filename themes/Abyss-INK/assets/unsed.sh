#!/bin/sh
sed -i \
         -e 's/rgb(0%,0%,0%)/#00000a/g' \
         -e 's/rgb(100%,100%,100%)/#999999/g' \
    -e 's/rgb(50%,0%,0%)/#000000/g' \
     -e 's/rgb(0%,50%,0%)/#8585f2/g' \
 -e 's/rgb(0%,50.196078%,0%)/#8585f2/g' \
     -e 's/rgb(50%,0%,50%)/#000011/g' \
 -e 's/rgb(50.196078%,0%,50.196078%)/#000011/g' \
     -e 's/rgb(0%,0%,50%)/#c1c1c1/g' \
	"$@"
