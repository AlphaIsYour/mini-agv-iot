import bpy
import math
from mathutils import Quaternion, Matrix

# ── Konfigurasi ─────────────────────────────────────────────────────────────
LINES = [
    "thanks to:",
    "alphareno",
    "dzaki",
    "illyas",
    "derby"
]
FONT_SIZE = 0.8
EXTRUDE = 0.1
BEVEL_DEPTH = 0.03
BEVEL_RES = 3
LINE_GAP = 1.2  # Jarak antar baris

# Posisi huruf B dari BRUNO SIMON asli
B_POS = (-10.8695, -5.72499, -2.52785)

# Rotation quaternion huruf asli (tidur/datar)
B_QUAT = Quaternion((0.976296, 0.0, 0.0, 0.21644))

# ── Material Neon Biru ─────────────────────────────────────────────────────
def create_neon_material():
    mat = bpy.data.materials.new(name="NeonBlue_Credits")
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

# ── Hitung total height untuk center ───────────────────────────────────────
total_height = (len(LINES) - 1) * LINE_GAP
start_z = total_height / 2

# ── Buat text per baris ────────────────────────────────────────────────────
for i, line in enumerate(LINES):
    bpy.ops.object.text_add(location=(0, 0, 0))
    obj = bpy.context.active_object
    obj.name = f"Credit_{i}_{line.replace(' ', '_')}"
    obj.data.body = line

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

    # Posisi lokal: geser ke bawah per baris (sumbu Z lokal = vertikal)
    local_z = start_z - i * LINE_GAP
    local_pos = Matrix.Translation((0, 0, local_z))

    # Gabung: posisi lokal → rotate → translate ke posisi B
    world_matrix = Matrix.Translation(B_POS) @ B_QUAT.to_matrix().to_4x4() @ local_pos
    obj.matrix_world = world_matrix

    # Material
    obj.data.materials.clear()
    obj.data.materials.append(mat)

print(f"✅ Credits created! {len(LINES)} lines, vertical layout")
print(f"   → Standing at {B_POS}")
print("   → File → Export → glTF 2.0 (.glb)")
