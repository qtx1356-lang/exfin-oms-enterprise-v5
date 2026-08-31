#!/bin/bash
for file in src/features/admin/*.tsx; do
  if grep -q "import { db }" "$file"; then
    echo "Processing $file..."
    # Replace import { db } with import { getAdminDb }
    sed -i "s/import { db } from '..\/..\/services\/firebase\/config';/import { getAdminDb } from '..\/..\/services\/firebase\/config';/g" "$file"
    
    # Replace the useEffect pattern if it exists
    # This might be tricky with sed, but let's see.
  fi
done
