#!/bin/bash

dalgon_path="$(dirname ${BASH_SOURCE[0]})"
date="$(date +%F)"

mkdir $dalgon_path/logs 2> /dev/null
mkdir $dalgon_path/logs/$date 2> /dev/null
cp $dalgon_path/dalgon.log $dalgon_path/logs/$date/dalgon.log
echo "" > $dalgon_path/dalgon.log

