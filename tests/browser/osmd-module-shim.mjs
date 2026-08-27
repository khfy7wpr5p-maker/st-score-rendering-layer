const OpenSheetMusicDisplay = globalThis.opensheetmusicdisplay?.OpenSheetMusicDisplay;

if (OpenSheetMusicDisplay === undefined) {
  throw new Error("OSMD browser global is unavailable for the renderer-internal browser fixture.");
}

export { OpenSheetMusicDisplay };
export default { OpenSheetMusicDisplay };
