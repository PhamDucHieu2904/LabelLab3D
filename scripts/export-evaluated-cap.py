import bpy
import json
import os
import sys

source = os.environ["PULLCAP_CAP_SOURCE"]
output = os.environ["PULLCAP_CAP_OUTPUT"]
bpy.ops.wm.open_mainfile(filepath=source, load_ui=False)
source_obj = bpy.data.objects.get("Cap")
if source_obj is None or source_obj.type != 'MESH':
    raise RuntimeError("Cap mesh object not found")

depsgraph = bpy.context.evaluated_depsgraph_get()
evaluated = source_obj.evaluated_get(depsgraph)
mesh = bpy.data.meshes.new_from_object(evaluated, preserve_all_data_layers=True, depsgraph=depsgraph)
export_obj = bpy.data.objects.new("Cap_EvaluatedViewport", mesh)
bpy.context.collection.objects.link(export_obj)
export_obj.matrix_world = source_obj.matrix_world.copy()

bpy.ops.object.select_all(action='DESELECT')
export_obj.select_set(True)
bpy.context.view_layer.objects.active = export_obj
bpy.ops.export_scene.gltf(
    filepath=output,
    export_format='GLB',
    use_selection=True,
    export_apply=False,
    export_yup=True,
    export_cameras=False,
    export_lights=False,
)

provenance = {
    "source": source,
    "object": source_obj.name,
    "evaluated": True,
    "evaluation": "Blender depsgraph viewport settings (show_viewport modifiers)",
    "modifiers": [
        {
            "name": m.name,
            "type": m.type,
            "show_viewport": m.show_viewport,
            "levels": getattr(m, "levels", None),
        }
        for m in source_obj.modifiers
    ],
    "vertices": len(mesh.vertices),
    "polygons": len(mesh.polygons),
    "output": output,
}
with open(os.environ["PULLCAP_CAP_PROVENANCE"], "w", encoding="utf-8") as f:
    json.dump(provenance, f, indent=2)
    f.write("\n")
