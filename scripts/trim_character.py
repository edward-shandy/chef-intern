"""Shrinks a KayKit character GLB to the animations and meshes the game uses.

Usage: python scripts/trim_character.py <source.glb> <output.glb>
"""

import json
import struct
import sys

# Clips the client plays; everything else in the pack's 76 animations is dropped.
KEEP_CLIPS = {"Idle", "Running_A", "1H_Melee_Attack_Chop", "2H_Melee_Idle", "Interact", "Cheer"}


def read_glb(path):
    data = open(path, "rb").read()
    json_length = struct.unpack_from("<I", data, 12)[0]
    document = json.loads(data[20 : 20 + json_length])
    binary_start = 20 + json_length + 8
    return document, data[binary_start:]


def remap(used):
    return {old: new for new, old in enumerate(sorted(used))}


def trim(document, binary):
    document["animations"] = [clip for clip in document["animations"] if clip["name"] in KEEP_CLIPS]

    # Weapons, hats and capes are rigid meshes hung on bones; only the skinned body parts stay.
    for node in document["nodes"]:
        if "mesh" in node and "skin" not in node:
            del node["mesh"]
    meshes = remap({node["mesh"] for node in document["nodes"] if "mesh" in node})
    document["meshes"] = [document["meshes"][old] for old in sorted(meshes)]
    for node in document["nodes"]:
        if "mesh" in node:
            node["mesh"] = meshes[node["mesh"]]

    used = set()
    for mesh in document["meshes"]:
        for primitive in mesh["primitives"]:
            used.update(primitive["attributes"].values())
            if "indices" in primitive:
                used.add(primitive["indices"])
    for skin in document.get("skins", []):
        used.add(skin["inverseBindMatrices"])
    for clip in document["animations"]:
        for sampler in clip["samplers"]:
            used.update((sampler["input"], sampler["output"]))
    accessors = remap(used)
    document["accessors"] = [document["accessors"][old] for old in sorted(accessors)]
    for mesh in document["meshes"]:
        for primitive in mesh["primitives"]:
            primitive["attributes"] = {key: accessors[value] for key, value in primitive["attributes"].items()}
            if "indices" in primitive:
                primitive["indices"] = accessors[primitive["indices"]]
    for skin in document.get("skins", []):
        skin["inverseBindMatrices"] = accessors[skin["inverseBindMatrices"]]
    for clip in document["animations"]:
        for sampler in clip["samplers"]:
            sampler["input"] = accessors[sampler["input"]]
            sampler["output"] = accessors[sampler["output"]]

    views = remap(
        {accessor["bufferView"] for accessor in document["accessors"]}
        | {image["bufferView"] for image in document.get("images", []) if "bufferView" in image}
    )
    packed = bytearray()
    kept_views = []
    for old in sorted(views):
        view = dict(document["bufferViews"][old])
        start = view.get("byteOffset", 0)
        while len(packed) % 4:
            packed.append(0)
        view["byteOffset"] = len(packed)
        packed += binary[start : start + view["byteLength"]]
        kept_views.append(view)
    document["bufferViews"] = kept_views
    for accessor in document["accessors"]:
        accessor["bufferView"] = views[accessor["bufferView"]]
    for image in document.get("images", []):
        if "bufferView" in image:
            image["bufferView"] = views[image["bufferView"]]
    while len(packed) % 4:
        packed.append(0)
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
    size = write_glb(target, *trim(*read_glb(source)))
    print(f"{target}: {size // 1024} KB")
