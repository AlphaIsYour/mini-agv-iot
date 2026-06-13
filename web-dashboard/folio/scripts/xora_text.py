import bpy
import math
from mathutils import Quaternion, Matrix

# ── Konfigurasi ─────────────────────────────────────────────────────────────
LETTERS = ['X', 'O', 'R', 'A', 'A', 'G', 'V']
FONT_SIZE = 1.8
EXTRUDE = 0.15
BEVEL_DEPTH = 0.04
BEVEL_RES = 4
GAP = 0.3

# Posisi huruf B dari BRUNO SIMON asli
B_POS = (-10.8695, -5.72499, -2.52785)

# Rotation: 90° X (berdiri) + quaternion huruf asli
B_QUAT = Quaternion((0.976296, 0.0, 0.0, 0.21644)) @ Quaternion((1, 0, 0), math.radians(90))

# ── Material Neon Biru ─────────────────────────────────────────────────────
def create_neon_material():
    mat = bpy.data.materials.new(name="NeonBlue_XORA")
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    for node in nodes:
        nodes.remove(node)

    output = nodes.new('ShaderNodeOutputMaterial')
    output.location = (400, 0)
    bsdf = nodes.new('ShaderNodeBsdfPrincipled')
    bsdf.location = (0, 0)
    bsdf.inputs['Base Color'].default_value = (0.0, 0.83, 1.0, 1.0)
    bsdf.inputs['Emission Color'].default_value = (0.0, 0.83, 1.0, 1.0)
    bsdf.inputs['Emission Strength'].default_value = 2.0
    bsdf.inputs['Roughness'].default_value = 0.3
    bsdf.inputs['Metallic'].default_value = 0.1
    links.new(bsdf.outputs['BSDF'], output.inputs['Surface'])
    return mat

mat = create_neon_material()

# ── Hitung total width ─────────────────────────────────────────────────────
total_width = len(LETTERS) * FONT_SIZE + (len(LETTERS) - 1) * GAP
start_offset = -total_width / 2 + FONT_SIZE / 2

# ── Buat huruf per huruf ───────────────────────────────────────────────────
for i, char in enumerate(LETTERS):
    bpy.ops.object.text_add(location=(0, 0, 0))
    obj = bpy.context.active_object
    obj.name = f"Letter_{char}_{i}"
    obj.data.body = char

    # Style
    obj.data.size = FONT_SIZE
    obj.data.extrude = EXTRUDE
    obj.data.bevel_depth = BEVEL_DEPTH
    obj.data.bevel_resolution = BEVEL_RES
    obj.data.align_x = 'CENTER'
    obj.data.align_y = 'CENTER'

    # Convert ke mesh
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.convert(target='MESH')

    # Posisi lokal (berjejer horizontal)
    local_x = start_offset + i * (FONT_SIZE + GAP)
    local_pos = Matrix.Translation((local_x, 0, 0))

    # Gabung: posisi lokal → rotate → translate ke posisi B
    world_matrix = Matrix.Translation(B_POS) @ B_QUAT.to_matrix().to_4x4() @ local_pos
    obj.matrix_world = world_matrix

    # Material
    obj.data.materials.clear()
    obj.data.materials.append(mat)

print(f"✅ {len(LETTERS)} huruf XORA AGV created!")
print(f"   → Standing upright at {B_POS}")
print("   → File → Export → glTF 2.0 (.glb)")
