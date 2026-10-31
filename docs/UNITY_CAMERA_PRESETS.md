# Unity camera preset provenance

The public camera strip maps to the production app's **View 1, View 2, View 3, View 4**, in that order. These are the actual TMP button labels and their `ProductCameraOrbit.ApplyPreset(0–3)` bindings; Front/3⁄4/Left/Right/Back/Top were not the app's configured presets.

The enabled production scenes are recorded in [EditorBuildSettings.asset](<D:/UnityHubData/Unity_3D_Mockup_Project/ProjectSettings/EditorBuildSettings.asset:8>). The camera preset component is serialized in Master_Scene; `Assets/Script/CameraShotController.cs` has no serialized scene or prefab references and does not drive these buttons.

## Exact serialized views

Source: [Master_Scene.unity](<D:/UnityHubData/Unity_3D_Mockup_Project/Assets/System/Scene/Master_Scene.unity:19204>).

| Label / index | Saved position (Unity units) | Saved rotation (Euler degrees) | FOV |
|---|---|---|---|
| View 1 / 0 | `(0, 1, -5)` | `(0, 0, 0)` | `27` |
| View 2 / 1 | `(0, 1, -19.999998)` | `(0, 0, 0)` | `10` |
| View 3 / 2 | `(0.03945524, -0.50026906, -3.3437643)` | `(-25, 0, 0)` | `39.18977` |
| View 4 / 3 | `(1.2723889, 2.6819835, -3.1030798)` | `(26.63438, 337.70438, 0)` | `37.982372` |

Bindings: [View 1](<D:/UnityHubData/Unity_3D_Mockup_Project/Assets/System/Scene/Master_Scene.unity:17132>), [View 2](<D:/UnityHubData/Unity_3D_Mockup_Project/Assets/System/Scene/Master_Scene.unity:33657>), [View 3](<D:/UnityHubData/Unity_3D_Mockup_Project/Assets/System/Scene/Master_Scene.unity:3916>), [View 4](<D:/UnityHubData/Unity_3D_Mockup_Project/Assets/System/Scene/Master_Scene.unity:24438>). Their anchored X positions increase in this order.

## Camera reconstruction and motion

[ApplyPreset](<D:/UnityHubData/Unity_3D_Mockup_Project/Assets/System/Script/ProductCameraOrbit.cs:313>) sets the saved yaw, pitch and FOV, resets pan to its default, and derives radius from `distance(savedPosition, targetPosition + (0,1,0))`. It does **not** copy the saved XYZ directly to the camera. [LateUpdate](<D:/UnityHubData/Unity_3D_Mockup_Project/Assets/System/Script/ProductCameraOrbit.cs:299>) reconstructs camera position as `Euler(pitch,yaw,0) * (0,0,-radius) + focus`.

[The interpolation](<D:/UnityHubData/Unity_3D_Mockup_Project/Assets/System/Script/ProductCameraOrbit.cs:263>) uses Unity `SmoothDampAngle` for yaw/pitch and `SmoothDamp` for distance, FOV and pan. The production [smoothTime is 0.15 seconds](<D:/UnityHubData/Unity_3D_Mockup_Project/Assets/System/Scene/Master_Scene.unity:19203>); this is a damping parameter, not a fixed transition duration. Web ports the Unity polynomial and shortest-angle behavior.

Web geometry uses **0.1 metres per source unit**: [Basil exporter](<D:/program project/3d display product website/scripts/export-basil-290.py:25>), [can exporter](<D:/program project/3d display product website/scripts/export-web-cans.py:32>), and [PET manifest](<D:/program project/3D mockup web version/public/models/bottles/pet-500-short-label.manifest.json:26>). The resulting radii are `0.5`, `1.9999998`, `0.366512259853763`, `0.375195232542786` metres. Reflecting Unity Z into the web camera convention gives View 4 yaw `+22.29562°`; View 3 retains negative elevation `-25°`.

Basil's exported mesh is centered around [sourceCenter `(0,0,0.9023135900497437)`](<D:/program project/3D mockup web version/public/models/bottles/glass-290-basil.manifest.json:13>). Its corresponding focus offset above the centered model is `(1 - 0.9023135900497437) * 0.1 = 0.00976864099502563` metres. The asset-specific focus translation is separate from preset radius and FOV.

The web's separate **Animated** control enters/exits its existing showcase motion. Once idle, View 1–4 apply the source camera presets. Unconditional product turntable motion during a camera transition was corrected so preset interpolation does not add a product spin.

## Validation scope

Validated against serialized Unity source, unit tests and the browser. The PC app was not executed for a visual comparison; pixel equality with the PC render is not claimed.
