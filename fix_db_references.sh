#!/bin/bash
# Find all files importing db from config or db_sync
FILES=$(grep -rl "import { db" src/)

for file in $FILES; do
  echo "Processing $file"
  # This might be tricky to do perfectly with sed, but let's try.
  # Basically, replacing collection(db, with collection(await getDb(), 
  # But we can't do that if the function is not async.
  # Let's see how many of them are inside async functions.
done
