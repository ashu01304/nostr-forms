import os
import json

def generate_directory_tree(root_dir, exclude_dirs):
    tree = {}
    for dirpath, dirnames, filenames in os.walk(root_dir):
        dirnames[:] = [d for d in dirnames if d not in exclude_dirs]
        rel_path = os.path.relpath(dirpath, root_dir)
        parent = tree
        if rel_path != ".":
            for part in rel_path.split(os.sep):
                parent = parent.setdefault(part, {})
        for filename in filenames:
            parent.setdefault(filename, {})
    return tree

def write_human_readable(tree, prefix=""):  # Change function format
    output = ""
    items = list(tree.items())
    for i, (key, value) in enumerate(items):
        connector = "└── " if i == len(items) - 1 else "├── "
        output += f"{prefix}{connector}{key}\n"
        if isinstance(value, dict):
            new_prefix = prefix + ("    " if i == len(items) - 1 else "│   ")
            output += write_human_readable(value, new_prefix)
    return output


if __name__ == "__main__":
    root_directory = os.getcwd()
    exclude_dirs = {"node_modules", "venv", "__pycache__", ".git"}
    directory_tree = generate_directory_tree(root_directory, exclude_dirs)
    
    with open("directory_tree.txt", "w", encoding="utf-8") as txt_file:
        txt_file.write(write_human_readable(directory_tree))
    
    with open("directory_tree.json", "w", encoding="utf-8") as json_file:
        json.dump(directory_tree, json_file, separators=(",", ":"))
    
    print("Directory mapping completed. Check 'directory_tree.txt' and 'directory_tree.json'")

