import zipfile
import os

exclude_dirs = {'.git', 'node_modules', '.vite', '.npm', 'dist'}
exclude_files = {'create_source_zip.py', 'create_marketing_zip.py', 'Office_Management_System_Marketing_Assets.zip', 'Office_Management_System_Codester.zip', 'exfin-oms-enterprise-v5-dist.zip'}

print("Creating ZIP file...")
with zipfile.ZipFile("Office_Management_System_Codester.zip", "w", zipfile.ZIP_DEFLATED) as zipf:
    for root, dirs, files in os.walk("."):
        dirs[:] = [d for d in dirs if d not in exclude_dirs]
        for file in files:
            if file in exclude_files:
                continue
            filepath = os.path.join(root, file)
            arcname = os.path.relpath(filepath, ".")
            zipf.write(filepath, arcname)
print("Done.")
