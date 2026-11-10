"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import { Check, ChevronDown, Circle, Droplets, Layers3, RotateCcw, Sticker } from "lucide-react";
import { getModelMaterialDefaults, type LabModel } from "@/lib/labellab/catalog";
import { getLiquidPresetSettings, getLiquidType, LIQUID_TYPES } from "@/lib/labellab/liquid-presets";
import type { ScenePreferences } from "@/lib/labellab/preferences";
import styles from "./PropertiesPanel.module.css";

type Part = "liquid" | "cap" | "body" | "label";
interface Props {
  model: LabModel;
  settings: ScenePreferences;
  onChange: (patch: Partial<ScenePreferences>) => void;
  artwork?: ReactNode;
}

/** Native sliders share bounded settings with optional direct numeric entry. */
function PropertyNumber({ id, label, value, onChange, min = 0, max = 1, step = 0.01, scale = 100, unit = "%", hint, showInput = true }: {
  id: string; label: string; value: number; onChange: (value: number) => void;
  min?: number; max?: number; step?: number; scale?: number; unit?: string; hint?: string; showInput?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const displayed = Number((value * scale).toFixed(3));
  const commit = (text: string) => {
    const parsed = text.trim() === "" ? NaN : Number(text) / scale;
    if (Number.isFinite(parsed)) onChange(Math.max(min, Math.min(max, parsed)));
    setEditing(false);
  };
  return <div className={styles.numberField} title={hint}>
    <div className={styles.numberHeading}>
      <label htmlFor={id}>{label}</label>
      {showInput && <span className={styles.numberBox}>
        <input id={id} type="number" inputMode="decimal" min={min * scale} max={max * scale} step={Number((step * scale).toFixed(3))}
          value={editing ? draft : displayed}
          onFocus={() => { setDraft(String(displayed)); setEditing(true); }}
          onChange={(event) => {
            const text = event.target.value;
            setDraft(text);
            const parsed = text === "" ? NaN : Number(text) / scale;
            if (Number.isFinite(parsed) && parsed >= min && parsed <= max) onChange(parsed);
          }}
          onBlur={(event) => commit(event.currentTarget.value)}
          onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} />
        {unit && <span aria-hidden="true">{unit}</span>}
      </span>}
    </div>
    <input id={showInput ? `${id}-slider` : id} className={styles.slider} type="range" aria-label={`${label} slider`} aria-valuetext={`${displayed}${unit}`} min={min} max={max} step={step} value={value}
      style={{ "--property-fill": `${(value - min) / (max - min) * 100}%` } as CSSProperties}
      onChange={(event) => onChange(Number(event.target.value))} />
  </div>;
}

function PropertyColor({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (value: string) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  return <div className={styles.colorRow}>
    <label htmlFor={id}>{label}</label>
    <div className={styles.colorBox}>
      <input id={`${id}-hex`} type="text" aria-label={`${label} hex`} spellCheck={false} maxLength={7}
        value={draft ?? value.toUpperCase()}
        onFocus={() => setDraft(value.toUpperCase())}
        onChange={(event) => {
          const text = event.target.value;
          setDraft(text);
          if (/^#[0-9a-f]{6}$/i.test(text)) onChange(text);
        }}
        onBlur={() => setDraft(null)}
        onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} />
      <input id={id} type="color" aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  </div>;
}

export default function PropertiesPanel({ model, settings, onChange, artwork }: Props) {
  const hasLiquid = Boolean(model.asset.materialSlots?.liquid?.length);
  const hasCap = Boolean(model.asset.materialSlots?.cap?.length || model.asset.materialSlots?.tab?.length);
  const hasBody = Boolean(model.asset.materialSlots?.body?.length);
  const hasLabel = Boolean(model.asset.materialSlots?.label?.length);
  const [part, setPart] = useState<Part>(hasLiquid ? "liquid" : "body");
  const parts = [
    { id: "liquid" as const, label: "Liquid", icon: Droplets, available: hasLiquid },
    { id: "cap" as const, label: model.category === "can" ? "Top" : "Cap", icon: Circle, available: hasCap },
    { id: "body" as const, label: model.category === "can" ? "Body" : "Bottle", icon: Layers3, available: hasBody },
    { id: "label" as const, label: "Label", icon: Sticker, available: hasLabel },
  ].filter((item) => item.available);
  const activePart = parts.find((item) => item.id === part) ?? parts[0];
  const selected = activePart?.id;
  const liquid = getLiquidType(settings.liquidType);
  const defaults = getModelMaterialDefaults(model.id);
  const preset = liquid.presets.find((item) => item.color.toLowerCase() === settings.liquidColor.toLowerCase());
  const changeLiquid = (patch: Partial<ScenePreferences>) => onChange({ ...patch, liquidCustomized: true });
  const reset = () => {
    if (selected === "liquid") onChange({
      liquidType: defaults.liquidType, liquidColor: defaults.liquidColor,
      liquidClarity: defaults.liquidClarity, liquidDensity: defaults.liquidDensity,
      liquidTurbidity: defaults.liquidTurbidity, liquidBrightness: defaults.liquidBrightness,
      liquidScattering: defaults.liquidScattering, liquidRoughness: defaults.liquidRoughness,
      liquidIor: defaults.liquidIor, liquidCustomized: defaults.liquidCustomized,
      liquidSparkling: defaults.liquidSparkling,
    });
    if (selected === "cap") onChange({ capColor: defaults.capColor, capMetalness: defaults.capMetalness, capRoughness: defaults.capRoughness });
    if (selected === "body") onChange({ bodyMetalness: defaults.bodyMetalness, bodyRoughness: defaults.bodyRoughness });
    if (selected === "label") onChange({ labelOffset: defaults.labelOffset, roughness: defaults.roughness, metalness: defaults.metalness });
  };
  return <section className={styles.root} data-tool-section="materials" data-theme={settings.sceneMode === "studio" ? "studio" : settings.style}>
    {artwork}
    {hasLabel && <div className={styles.artworkOffset}>
      <PropertyNumber id="artwork-offset" label="Artwork offset" min={-100} max={100} step={0.1} scale={1}
        value={settings.labelOffset} hint="Slide the artwork around the package. 0% is the original position."
        onChange={(labelOffset) => onChange({ labelOffset })} />
    </div>}
    <div className={styles.parts} role="group" aria-label="Edit properties for">
      {parts.map(({ id, label, icon: Icon }) => <button type="button" key={id} aria-pressed={selected === id} onClick={() => setPart(id)}>
        <Icon size={15} aria-hidden="true" /><span>{label}</span>
      </button>)}
    </div>
    <div className={styles.sectionHeading}>
      <div><h3>{selected === "liquid" ? "Liquid appearance" : selected === "cap" ? model.category === "can" ? "Top & pull tab" : "Cap finish" : selected === "body" ? "Surface finish" : "Label finish"}</h3>
        {selected !== "liquid" && <p>{selected === "label" ? "Texture & reflection." : "Fine-tune the way light feels."}</p>}</div>
      <button type="button" className={styles.reset} onClick={reset} aria-label={`Reset ${activePart?.label.toLowerCase()} properties`} title="Restore model defaults"><RotateCcw size={14} aria-hidden="true" /></button>
    </div>
    {selected === "liquid" && <>
      <label className={styles.typeField} htmlFor="liquid-type"><span>Liquid type</span>
        <span className={styles.selectWrap}><Droplets size={15} aria-hidden="true" /><select id="liquid-type" value={liquid.id} onChange={(event) => onChange(getLiquidPresetSettings(event.target.value))}>
          {LIQUID_TYPES.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}
        </select><ChevronDown size={14} aria-hidden="true" /></span>
      </label>
      <p className={styles.typeDescription}>{liquid.description}</p>
      <div className={styles.presetHeading}><span>Color presets</span><span>{preset?.name ?? "Custom"}</span></div>
      <div className={styles.presets} role="group" aria-label={`${liquid.name} color presets`}>
        {liquid.presets.map((item) => <button key={item.id} type="button" title={`${item.name} · ${item.color.toUpperCase()}`}
          aria-label={`${item.name} preset`} aria-pressed={preset?.id === item.id}
          onClick={() => onChange(getLiquidPresetSettings(liquid.id, item.id))}>
          <span className={styles.presetColor} style={{ backgroundColor: item.color }}>{preset?.id === item.id && <Check size={13} aria-hidden="true" />}</span>
          <span>{item.name}</span>
        </button>)}
      </div>
      <PropertyColor id="liquid-color" label="Liquid color" value={settings.liquidColor} onChange={(liquidColor) => onChange({ liquidColor })} />
      <div className={styles.divider} />
      <div className={styles.controlGrid}>
        <PropertyNumber id="liquid-clarity" label="Clarity" showInput={false} value={settings.liquidClarity} hint="How much of the background passes through the liquid." onChange={(liquidClarity) => changeLiquid({ liquidClarity })} />
        <PropertyNumber id="liquid-density" label="Density" showInput={false} value={settings.liquidDensity} hint="Optical concentration: how strongly the liquid absorbs light." onChange={(liquidDensity) => changeLiquid({ liquidDensity })} />
        <PropertyNumber id="liquid-turbidity" label="Turbidity" showInput={false} value={settings.liquidTurbidity} hint="Cloudiness from fine particles in the liquid." onChange={(liquidTurbidity) => changeLiquid({ liquidTurbidity })} />
        <PropertyNumber id="liquid-brightness" label="Brightness" showInput={false} max={2} value={settings.liquidBrightness} hint="100% keeps the original color brightness." onChange={(liquidBrightness) => changeLiquid({ liquidBrightness })} />
      </div>
      {model.asset.sparkling && <PropertyNumber id="liquid-sparkling" label="Sparkling" step={.001} value={settings.liquidSparkling}
        hint="Amount of rising gas bubbles inside the liquid. 0% turns them off."
        onChange={(liquidSparkling) => onChange({ liquidSparkling })} />}
      <details className={styles.advanced} key={liquid.id}>
        <summary><span>Fine-tune {liquid.name.toLowerCase()}</span><ChevronDown size={14} aria-hidden="true" /></summary>
        <div className={styles.advancedFields}>
          {liquid.controls.includes("ior") && <PropertyNumber id="liquid-ior" label="Refraction (IOR)" min={1} max={1.6} step={0.001} scale={1} unit="" value={settings.liquidIor} hint="Higher values bend the background more strongly." onChange={(liquidIor) => changeLiquid({ liquidIor })} />}
          {liquid.controls.includes("scattering") && <PropertyNumber id="liquid-scattering" label="Light scattering" value={settings.liquidScattering} hint="A soft, milky diffusion of light inside the liquid." onChange={(liquidScattering) => changeLiquid({ liquidScattering })} />}
          {liquid.controls.includes("roughness") && <PropertyNumber id="liquid-roughness" label="Liquid roughness" value={settings.liquidRoughness} hint="Softens the liquid surface and transmitted reflections." onChange={(liquidRoughness) => changeLiquid({ liquidRoughness })} />}
        </div>
      </details>
    </>}
    {selected === "cap" && <>
      <PropertyColor id="cap-color" label={model.category === "can" ? "Top color" : "Cap color"} value={settings.capColor} onChange={(capColor) => onChange({ capColor })} />
      <div className={styles.controlGrid}>
        <PropertyNumber id="cap-metalness" label="Metallic" value={settings.capMetalness} onChange={(capMetalness) => onChange({ capMetalness })} />
        <PropertyNumber id="cap-roughness" label="Roughness" value={settings.capRoughness} onChange={(capRoughness) => onChange({ capRoughness })} />
      </div>
      <p className={styles.help}>Less roughness gives a polished finish. More adds a soft, matte look.</p>
    </>}
    {selected === "body" && <>
      <div className={styles.surfaceType}><Layers3 size={18} aria-hidden="true" /><span>{model.category === "glass" ? "Glass bottle" : model.category === "pet" ? "PET bottle" : model.category === "pp" ? "PP bottle" : "Aluminum body"}<small>{model.volume} · {model.category === "can" ? "Unprinted surface" : "Bottle surface"}</small></span></div>
      <div className={styles.controlGrid}>
        <PropertyNumber id="body-metalness" label="Metallic" value={settings.bodyMetalness} onChange={(bodyMetalness) => onChange({ bodyMetalness })} />
        <PropertyNumber id="body-roughness" label="Roughness" value={settings.bodyRoughness} onChange={(bodyRoughness) => onChange({ bodyRoughness })} />
      </div>
      <p className={styles.help}>Shape reflections with metallic, then soften them with roughness.</p>
    </>}
    {selected === "label" && <>
      <div className={styles.controlGrid}>
        <PropertyNumber id="label-metalness" label="Metallic" value={settings.metalness} onChange={(metalness) => onChange({ metalness })} />
        <PropertyNumber id="label-roughness" label="Roughness" value={settings.roughness} onChange={(roughness) => onChange({ roughness })} />
      </div>
      <p className={styles.help}>Choose how the printed artwork reflects light.</p>
    </>}
  </section>;
}
