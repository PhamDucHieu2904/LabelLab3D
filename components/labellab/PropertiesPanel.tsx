"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import { Check, ChevronDown, Circle, Droplets, Layers3, RotateCcw, Sticker } from "lucide-react";
import { getModelMaterialDefaults, type LabModel } from "@/lib/labellab/catalog";
import { getLiquidPresetSettings, getLiquidType, LIQUID_TYPES } from "@/lib/labellab/liquid-presets";
import type { ScenePreferences } from "@/lib/labellab/preferences";
import { useLocale } from "./LocaleProvider";
import styles from "./PropertiesPanel.module.css";

export type PropertiesPart = "liquid" | "cap" | "body" | "label";
interface Props {
  model: LabModel;
  settings: ScenePreferences;
  onChange: (patch: Partial<ScenePreferences>) => void;
  artwork?: ReactNode;
  /** Controlled active part when driven by the split left sidebar rail. */
  activePart?: PropertiesPart;
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

export default function PropertiesPanel({ model, settings, onChange, artwork, activePart: controlledPart }: Props) {
  const { t } = useLocale();
  const p = t.studio.properties;
  const hasLiquid = Boolean(model.asset.materialSlots?.liquid?.length);
  const hasCap = Boolean(model.asset.materialSlots?.cap?.length || model.asset.materialSlots?.tab?.length);
  const hasBody = Boolean(model.asset.materialSlots?.body?.length);
  const hasLabel = Boolean(model.asset.materialSlots?.label?.length);
  const [internalPart, setInternalPart] = useState<PropertiesPart>(hasLiquid ? "liquid" : "body");
  const isControlled = controlledPart !== undefined;
  const parts = [
    { id: "label" as const, label: t.studio.rail.label, icon: Sticker, available: hasLabel },
    { id: "liquid" as const, label: t.studio.rail.liquid, icon: Droplets, available: hasLiquid },
    { id: "cap" as const, label: model.category === "can" ? t.studio.rail.top : t.studio.rail.cap, icon: Circle, available: hasCap },
    { id: "body" as const, label: model.category === "can" ? t.studio.rail.body : t.studio.rail.bottle, icon: Layers3, available: hasBody },
  ].filter((item) => item.available);
  const requestedPart = controlledPart ?? internalPart;
  const activePart = parts.find((item) => item.id === requestedPart) ?? parts[0];
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
    if (selected === "body") onChange({ bodyColor: defaults.bodyColor, bodyMetalness: defaults.bodyMetalness, bodyRoughness: defaults.bodyRoughness });
    if (selected === "label") onChange({ labelOffset: defaults.labelOffset, roughness: defaults.roughness, metalness: defaults.metalness });
  };
  // Keep ArtworkLibrary mounted in the tree even when another part is active so direct 3D
  // clicks on the bottle/can label always trigger the artwork editor modal seamlessly.
  const showArtworkInline = !isControlled || selected === "label";
  return <section className={styles.root} data-tool-section="materials" data-theme={settings.sceneMode === "studio" ? "studio" : settings.style}>
    <div style={showArtworkInline ? undefined : { display: "none" }}>
      {artwork}
      {hasLabel && <div className={styles.artworkOffset}>
        <PropertyNumber id="artwork-offset" label={p.artworkOffset} min={-100} max={100} step={0.1} scale={1}
          value={settings.labelOffset} hint={p.artworkOffsetHint}
          onChange={(labelOffset) => onChange({ labelOffset })} />
      </div>}
    </div>
    {!isControlled && (
      <div className={styles.parts} role="group" aria-label="Edit properties for">
        {parts.map(({ id, label, icon: Icon }) => <button type="button" key={id} aria-pressed={selected === id} onClick={() => setInternalPart(id)}>
          <Icon size={15} aria-hidden="true" /><span>{label}</span>
        </button>)}
      </div>
    )}
    <div className={`${styles.sectionHeading} ${isControlled && selected !== "label" ? styles.sectionHeadingFlush : ""}`}>
      <div><h3>{selected === "liquid" ? p.liquidAppearance : selected === "cap" ? model.category === "can" ? p.topAndTab : p.capFinish : selected === "body" ? p.surfaceFinish : p.labelFinish}</h3>
        {selected !== "liquid" && <p>{selected === "label" ? p.textureReflection : p.fineTuneLight}</p>}</div>
      <button type="button" className={styles.reset} onClick={reset} aria-label={p.restoreModelDefaults} title={p.restoreModelDefaults}><RotateCcw size={14} aria-hidden="true" /></button>
    </div>
    {selected === "liquid" && <>
      <label className={styles.typeField} htmlFor="liquid-type"><span>{p.liquidType}</span>
        <span className={styles.selectWrap}><Droplets size={15} aria-hidden="true" /><select id="liquid-type" value={liquid.id} onChange={(event) => onChange(getLiquidPresetSettings(event.target.value))}>
          {LIQUID_TYPES.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}
        </select><ChevronDown size={14} aria-hidden="true" /></span>
      </label>
      <p className={styles.typeDescription}>{liquid.description}</p>
      <div className={styles.presetHeading}><span>{p.colorPresets}</span><span>{preset?.name ?? p.custom}</span></div>
      <div className={styles.presets} role="group" aria-label={p.colorPresets}>
        {liquid.presets.map((item) => <button key={item.id} type="button" title={`${item.name} · ${item.color.toUpperCase()}`}
          aria-label={item.name} aria-pressed={preset?.id === item.id}
          onClick={() => onChange(getLiquidPresetSettings(liquid.id, item.id))}>
          <span className={styles.presetColor} style={{ backgroundColor: item.color }}>{preset?.id === item.id && <Check size={13} aria-hidden="true" />}</span>
          <span>{item.name}</span>
        </button>)}
      </div>
      <PropertyColor id="liquid-color" label={p.liquidColor} value={settings.liquidColor} onChange={(liquidColor) => onChange({ liquidColor })} />
      <div className={styles.divider} />
      <div className={styles.controlGrid}>
        <PropertyNumber id="liquid-clarity" label={p.clarity} showInput={false} value={settings.liquidClarity} onChange={(liquidClarity) => changeLiquid({ liquidClarity })} />
        <PropertyNumber id="liquid-density" label={p.density} showInput={false} value={settings.liquidDensity} onChange={(liquidDensity) => changeLiquid({ liquidDensity })} />
        <PropertyNumber id="liquid-turbidity" label={p.turbidity} showInput={false} value={settings.liquidTurbidity} onChange={(liquidTurbidity) => changeLiquid({ liquidTurbidity })} />
        <PropertyNumber id="liquid-brightness" label={p.brightness} showInput={false} max={2} value={settings.liquidBrightness} onChange={(liquidBrightness) => changeLiquid({ liquidBrightness })} />
      </div>
      {model.asset.sparkling && <PropertyNumber id="liquid-sparkling" label={p.sparkling} step={.001} value={settings.liquidSparkling}
        onChange={(liquidSparkling) => onChange({ liquidSparkling })} />}
      <details className={styles.advanced} key={liquid.id}>
        <summary><span>{p.fineTune(liquid.name)}</span><ChevronDown size={14} aria-hidden="true" /></summary>
        <div className={styles.advancedFields}>
          {liquid.controls.includes("ior") && <PropertyNumber id="liquid-ior" label={p.ior} min={1} max={1.6} step={0.001} scale={1} unit="" value={settings.liquidIor} onChange={(liquidIor) => changeLiquid({ liquidIor })} />}
          {liquid.controls.includes("scattering") && <PropertyNumber id="liquid-scattering" label={p.scattering} value={settings.liquidScattering} onChange={(liquidScattering) => changeLiquid({ liquidScattering })} />}
          {liquid.controls.includes("roughness") && <PropertyNumber id="liquid-roughness" label={p.liquidRoughness} value={settings.liquidRoughness} onChange={(liquidRoughness) => changeLiquid({ liquidRoughness })} />}
        </div>
      </details>
    </>}
    {selected === "cap" && <>
      <PropertyColor id="cap-color" label={model.category === "can" ? p.topColor : p.capColor} value={settings.capColor} onChange={(capColor) => onChange({ capColor })} />
      <div className={styles.controlGrid}>
        <PropertyNumber id="cap-metalness" label={p.metallic} value={settings.capMetalness} onChange={(capMetalness) => onChange({ capMetalness })} />
        <PropertyNumber id="cap-roughness" label={p.roughness} value={settings.capRoughness} onChange={(capRoughness) => onChange({ capRoughness })} />
      </div>
      <p className={styles.help}>{p.helpCap}</p>
    </>}
    {selected === "body" && <>
      <PropertyColor id="body-color" label={p.bodyColor} value={settings.bodyColor} onChange={(bodyColor) => onChange({ bodyColor })} />
      <div className={styles.controlGrid}>
        <PropertyNumber id="body-metalness" label={p.metallic} value={settings.bodyMetalness} onChange={(bodyMetalness) => onChange({ bodyMetalness })} />
        <PropertyNumber id="body-roughness" label={p.roughness} value={settings.bodyRoughness} onChange={(bodyRoughness) => onChange({ bodyRoughness })} />
      </div>
      <p className={styles.help}>{p.helpBody}</p>
    </>}
    {selected === "label" && <>
      <div className={styles.controlGrid}>
        <PropertyNumber id="label-metalness" label={p.metallic} value={settings.metalness} onChange={(metalness) => onChange({ metalness })} />
        <PropertyNumber id="label-roughness" label={p.roughness} value={settings.roughness} onChange={(roughness) => onChange({ roughness })} />
      </div>
      <p className={styles.help}>{p.helpLabel}</p>
    </>}
  </section>;
}
