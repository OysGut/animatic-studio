"""Claude: run with opentimelineio, otio-fcp-adapter and otio-cmx3600-adapter installed."""
import json
from pathlib import Path
import xml.etree.ElementTree as ET
import opentimelineio as otio

root = Path(__file__).parent
for label in ("24", "25", "30", "twos"):
    expected = json.loads((root / f"{label}.timing.json").read_text())
    fps = expected["fps"]["num"] / expected["fps"]["den"]
    for ext, adapter in (("otio", "otio_json"), ("xml", "fcp_xml"), ("edl", "cmx_3600")):
        kwargs = {"rate": fps} if ext == "edl" else {}
        timeline = otio.adapters.read_from_file(str(root / f"{label}.{ext}"), adapter_name=adapter, **kwargs)
        assert timeline.duration().rescaled_to(fps).value == expected["length"]
        video = timeline.tracks[0]
        clips = [c for c in video if isinstance(c, otio.schema.Clip)]
        transitions = [c for c in video if isinstance(c, otio.schema.Transition)]
        assert len(clips) == 2 and len(transitions) == 1
        assert sum(c.duration().rescaled_to(fps).value for c in clips) == expected["length"]
        assert transitions[0].duration().rescaled_to(fps).value == (6 if label == "30" else 5)
        assert all(c.media_reference.target_url and not c.media_reference.target_url.startswith("/") for c in clips)
        if ext != "edl":
            assert len(timeline.tracks) == 2
            for clip, timing in zip(clips, expected["shots"]):
                assert clip.source_range.start_time.value == timing["in"]
                assert clip.duration().value == timing["length"]
        if ext == "xml":
            document = ET.parse(root / f"{label}.xml").getroot()
            assert document.tag == "xmeml" and document.attrib["version"] == "5"
        print(f" ok {label}.{ext}: skjema, klipp, overgang og {expected['length']} bilder")
print("RESULTAT 12 bestått, 0 feilet")