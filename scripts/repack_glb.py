"""Rewrites a GLB so every accessor has its own tightly packed buffer view.

Some exporters interleave vertex attributes using one buffer view per attribute that
starts part-way into the shared data. That is readable by hand but three.js rejects it
with "Invalid typed array length". Repacking keeps every value and drops the interleaving.

Usage: python scripts/repack_glb.py <source.glb> <output.glb>
"""

import json
import struct
import sys

COMPONENTS = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT2": 4, "MAT3": 9, "MAT4": 16}
BYTES = {5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4}


def read_glb(path):
    data = open(path, "rb").read()
    json_length = struct.unpack_from("<I", data, 12)[0]
    document = json.loads(data[20 : 20 + json_length])
    return document, data[20 + json_length + 8 :]


def repack(document, binary):
    old_views = document["bufferViews"]
    packed = bytearray()
    views = []

    def add_view(chunk, target=None):
        while len(packed) % 4:
            packed.append(0)
        view = {"buffer": 0, "byteOffset": len(packed), "byteLength": len(chunk)}
        if target is not None:
            view["target"] = target
        packed.extend(chunk)
        views.append(view)
        return len(views) - 1

    for accessor in document["accessors"]:
        if "bufferView" not in accessor:
            continue
        view = old_views[accessor["bufferView"]]
        element = COMPONENTS[accessor["type"]] * BYTES[accessor["componentType"]]
        stride = view.get("byteStride", element)
        start = view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
        chunk = b"".join(binary[start + i * stride : start + i * stride + element] for i in range(accessor["count"]))
        accessor["bufferView"] = add_view(chunk, view.get("target"))
        accessor.pop("byteOffset", None)

    # Embedded images keep their bytes as they are.
    for image in document.get("images", []):
        if "bufferView" in image:
            view = old_views[image["bufferView"]]
            start = view.get("byteOffset", 0)
            image["bufferView"] = add_view(binary[start : start + view["byteLength"]])

    while len(packed) % 4:
        packed.append(0)
    document["bufferViews"] = views
    document["buffers"] = [{"byteLength": len(packed)}]
    return document, bytes(packed)


def write_glb(path, document, binary):
    text = json.dumps(document, separators=(",", ":")).encode("utf-8")
    text += b" " * (-len(text) % 4)
    total = 12 + 8 + len(text) + 8 + len(binary)
    with open(path, "wb") as output:
        output.write(struct.pack("<4sII", b"glTF", 2, total))
        output.write(struct.pack("<I4s", len(text), b"JSON") + text)
        output.write(struct.pack("<I4s", len(binary), b"BIN\x00") + binary)
    return total


if __name__ == "__main__":
    source, target = sys.argv[1], sys.argv[2]
    size = write_glb(target, *repack(*read_glb(source)))
    print(f"{target}: {size // 1024} KB")
