#!/usr/bin/env python3
"""Enrichment pass for the initial Mediathèque collection: populates verified archival metadata, tags, demos, rights, and clips."""

from __future__ import annotations

import json
from datetime import date
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parent.parent
sys_path = str(REPO_ROOT / "tools")
import sys  # noqa: E402

sys.path.insert(0, sys_path)
from analyzers import load_valid_tags  # noqa: E402
from ingest import generate_gif_frames_and_sheet  # noqa: E402

ENRICHMENTS: dict[str, dict[str, Any]] = {
    "sandow-1894": {
        "title": "Sandow (Edison Kinetoscope, 1894)",
        "status": "published",
        "summary": "Eugen Sandow flexing in the Black Maria studio, directed by William K. L. Dickson, 1894.",
        "description": (
            "Prussian strongman Eugen Sandow performs a sequence of bodybuilding poses in Thomas Edison's "
            "Black Maria studio in West Orange, New Jersey, filmed by William K. L. Dickson in May 1894. "
            "High-contrast full-figure framing against a plain dark backdrop makes this a canonical test "
            "clip for pose estimation, foreground segmentation, and body-zone mapping."
        ),
        "tags": [
            "person",
            "single",
            "fullbody",
            "front",
            "static-camera",
            "plain-bg",
            "movement",
            "pose",
            "slow",
            "bw",
            "silent",
            "loop-friendly",
            "early-film",
            "archival",
        ],
        "keywords": ["Eugen Sandow", "strongman", "muscle", "Edison", "Black Maria", "Kinetoscope", "Dickson"],
        "demos": ["pose", "segmentation", "body-zones", "background-subtraction"],
        "creators": [
            {"name": "William K. L. Dickson", "role": "director"},
            {"name": "Eugen Sandow", "role": "performer"},
        ],
        "date": "1894-05-18",
        "source": {
            "url": "https://commons.wikimedia.org/wiki/File:Sandow_(1894).webm",
            "origin": "https://www.loc.gov/item/00694118/",
            "archive": "Library of Congress / Wikimedia Commons",
            "retrieved": "2026-10-17",
            "via": None,
        },
        "rights": {
            "status": "public-domain",
            "license": "PD-US",
            "license_url": "https://commons.wikimedia.org/wiki/Template:PD-US",
            "credit": "William K. L. Dickson / Edison Manufacturing Co., 1894. Library of Congress. Public domain.",
            "notes": "",
        },
        "clips": [
            {
                "n": 1,
                "title": "Front double biceps",
                "summary": "Sandow faces the camera and raises both arms into a double-biceps pose.",
                "tags": ["person", "single", "fullbody", "front", "arms-raised", "pose", "slow", "plain-bg", "bw"],
                "demos": ["pose", "segmentation", "body-zones", "loop"],
                "in": 2.0,
                "out": 7.5,
                "file": "clips/01.webm",
                "thumb": "clips/01.thumb.webp",
            },
            {
                "n": 2,
                "title": "Chest expansion and side triceps",
                "summary": "Sandow turns three-quarter to demonstrate chest expansion and arm musculature.",
                "tags": ["person", "single", "fullbody", "three-quarter", "pose", "gesture", "plain-bg", "bw"],
                "demos": ["pose", "segmentation", "body-zones"],
                "in": 12.0,
                "out": 18.5,
                "file": "clips/02.webm",
                "thumb": "clips/02.thumb.webp",
            },
            {
                "n": 3,
                "title": "Rear lat spread and bow",
                "summary": "Sandow turns his back to flex his dorsal muscles before turning to bow.",
                "tags": ["person", "single", "fullbody", "back", "pose", "movement", "plain-bg", "bw"],
                "demos": ["pose", "segmentation", "tracking"],
                "in": 24.0,
                "out": 31.0,
                "file": "clips/03.webm",
                "thumb": "clips/03.thumb.webp",
            },
        ],
    },
    "danse-serpentine-lumiere-1897": {
        "title": "Danse serpentine (Lumière, 1897)",
        "status": "published",
        "summary": "Stencil-tinted serpentine dance filmed by the Lumière studio, 1897.",
        "description": (
            "A performer executes Loïe Fuller's serpentine dance in flowing silk drapery illuminated "
            "by frame-by-frame hand/stencil tinting (Catalogue Lumière no. 765, 1897). Excellent for "
            "optical flow, motion trails, color tracking, and fluid cloth dynamics."
        ),
        "tags": [
            "person",
            "single",
            "fullbody",
            "front",
            "static-camera",
            "plain-bg",
            "movement",
            "dance",
            "cyclic",
            "tinted",
            "color",
            "silent",
            "early-film",
            "archival",
        ],
        "keywords": ["Loïe Fuller", "serpentine dance", "Lumière", "hand-colored", "silk", "drapery"],
        "demos": ["optical-flow", "motion-trails", "color", "segmentation", "style-transfer"],
        "creators": [
            {"name": "Auguste and Louis Lumière", "role": "producer"},
        ],
        "date": "1897",
        "source": {
            "url": "https://en.wikipedia.org/wiki/File:Danse_serpentine_(Lumi%C3%A8re,_1897).webm",
            "origin": "https://catalogue-lumiere.com/danse-serpentine/",
            "archive": "Catalogue Lumière / Wikipedia",
            "retrieved": "2026-10-17",
            "via": None,
        },
        "rights": {
            "status": "public-domain",
            "license": "PD-US",
            "license_url": "https://commons.wikimedia.org/wiki/Template:PD-US",
            "credit": "Auguste and Louis Lumière, 1897 (Catalogue Lumière no. 765). Public domain.",
            "notes": "",
        },
        "clips": [
            {
                "n": 1,
                "title": "Butterfly wing figure-eights",
                "summary": "Wide alternating figure-eight sweeps of silk wands in rose and amber tint.",
                "tags": ["person", "single", "fullbody", "front", "dance", "cyclic", "tinted", "plain-bg"],
                "demos": ["optical-flow", "motion-trails", "color", "loop"],
                "in": 3.0,
                "out": 9.0,
                "file": "clips/01.webm",
                "thumb": "clips/01.thumb.webp",
            },
            {
                "n": 2,
                "title": "Spinning vortex canopy",
                "summary": "Rapid full-body spin lifting the fabric into a billowy overhead dome.",
                "tags": ["person", "single", "fullbody", "dance", "fast", "cyclic", "tinted", "plain-bg"],
                "demos": ["optical-flow", "motion-trails", "segmentation"],
                "in": 18.0,
                "out": 24.5,
                "file": "clips/02.webm",
                "thumb": "clips/02.thumb.webp",
            },
        ],
    },
    "la-sortie-de-l-usine-lumiere-a-lyon-i-1895": {
        "title": "La Sortie de l'Usine Lumière à Lyon (1895)",
        "status": "published",
        "summary": "Workers exiting the Lumière factory in Lyon, filmed by Louis Lumière, March 1895.",
        "description": (
            "First version ('un cheval') of Louis Lumière's landmark Cinématographe film showing workers, "
            "bicycles, a dog, and a horse-drawn carriage streaming through the gates of the Lumière factory "
            "at 25 rue Saint-Victor, Lyon. Ideal for multi-person tracking, crowd optical flow, and object detection."
        ),
        "tags": [
            "person",
            "animal",
            "vehicle",
            "crowd",
            "wide",
            "front",
            "static-camera",
            "movement",
            "walk",
            "work",
            "bw",
            "silent",
            "early-film",
            "archival",
        ],
        "keywords": ["Lumière", "Lyon", "factory", "workers", "crowd", "Cinématographe", "1895"],
        "demos": ["object-detection", "tracking", "optical-flow", "background-subtraction"],
        "creators": [{"name": "Louis Lumière", "role": "director"}],
        "date": "1895-03-19",
        "source": {
            "url": "https://commons.wikimedia.org/wiki/File:La_Sortie_de_l%27Usine_Lumi%C3%A8re_%C3%A0_Lyon_I_1895.webm",
            "origin": "https://www.institut-lumiere.org/",
            "archive": "Institut Lumière / Wikimedia Commons",
            "retrieved": "2026-10-17",
            "via": None,
        },
        "rights": {
            "status": "public-domain",
            "license": "PD-old-100",
            "license_url": "https://commons.wikimedia.org/wiki/Template:PD-old-100",
            "credit": "Louis Lumière, 1895. Institut Lumière / Wikimedia Commons. Public domain.",
            "notes": "",
        },
        "clips": [
            {
                "n": 1,
                "title": "Factory doors open and crowd emerges",
                "summary": "Workers pour out of the main portal and disperse left and right across the street.",
                "tags": ["person", "crowd", "wide", "walk", "static-camera", "bw", "early-film"],
                "demos": ["object-detection", "tracking", "optical-flow"],
                "in": 0.5,
                "out": 7.5,
                "file": "clips/01.webm",
                "thumb": "clips/01.thumb.webp",
            },
            {
                "n": 2,
                "title": "Horse-drawn carriage exits courtyard",
                "summary": "A two-horse carriage pulls out through the main gate as workers clear the doorway.",
                "tags": ["person", "animal", "vehicle", "crowd", "wide", "static-camera", "bw"],
                "demos": ["object-detection", "tracking"],
                "in": 25.0,
                "out": 33.0,
                "file": "clips/02.webm",
                "thumb": "clips/02.thumb.webp",
            },
        ],
    },
    "lancement-du-disque-par-l-athlete-americain-mccraken-1900": {
        "title": "Lancement du disque — McCracken (Marey, 1900)",
        "status": "published",
        "summary": "American athlete Josiah McCracken throwing the discus, filmed by Marey & Demenÿ at the 1900 Paris Olympics.",
        "description": (
            "Slow-motion chronophotographic study recorded by Étienne-Jules Marey and Georges Demenÿ during "
            "the 1900 Paris Exposition / Olympic Games showing American athlete Josiah McCracken executing "
            "the rotational discus throw."
        ),
        "tags": [
            "person",
            "single",
            "fullbody",
            "side",
            "static-camera",
            "movement",
            "sport",
            "slow",
            "bw",
            "silent",
            "early-film",
            "chronophotography",
            "archival",
        ],
        "keywords": ["Marey", "Demenÿ", "McCracken", "discus", "1900 Olympics", "biomechanics"],
        "demos": ["pose", "motion-trails", "optical-flow", "tracking"],
        "creators": [
            {"name": "Étienne-Jules Marey", "role": "director"},
            {"name": "Georges Demenÿ", "role": "cinematographer"},
            {"name": "Josiah McCracken", "role": "performer"},
        ],
        "date": "1900-07",
        "source": {
            "url": "https://commons.wikimedia.org/wiki/File:Lancement_du_disque_par_l%27athl%C3%A8te_americain_McCraken_(1900).webm",
            "origin": "https://www.cinematheque.fr/",
            "archive": "Cinémathèque française / Wikimedia Commons",
            "retrieved": "2026-10-17",
            "via": None,
        },
        "rights": {
            "status": "public-domain",
            "license": "PD-old-100",
            "license_url": "https://commons.wikimedia.org/wiki/Template:PD-old-100",
            "credit": "Étienne-Jules Marey & Georges Demenÿ, 1900. Cinémathèque française / Wikimedia Commons. Public domain.",
            "notes": "",
        },
    },
    "lancement-du-poids-par-l-athlete-americain-mccraken-1900": {
        "title": "Lancement du poids — McCracken (Marey, 1900)",
        "status": "published",
        "summary": "Josiah McCracken putting the shot, filmed by Marey & Demenÿ at the 1900 Paris Games.",
        "description": (
            "Biomechanical motion study by Étienne-Jules Marey and Georges Demenÿ capturing Josiah McCracken's "
            "shot put hop and release at the 1900 Paris Olympic Games."
        ),
        "tags": [
            "person",
            "single",
            "fullbody",
            "side",
            "static-camera",
            "movement",
            "sport",
            "jump",
            "slow",
            "bw",
            "silent",
            "early-film",
            "chronophotography",
            "archival",
        ],
        "keywords": ["Marey", "Demenÿ", "McCracken", "shot put", "1900 Olympics", "athletics"],
        "demos": ["pose", "motion-trails", "optical-flow", "tracking"],
        "creators": [
            {"name": "Étienne-Jules Marey", "role": "director"},
            {"name": "Georges Demenÿ", "role": "cinematographer"},
            {"name": "Josiah McCracken", "role": "performer"},
        ],
        "date": "1900-07",
        "source": {
            "url": "https://commons.wikimedia.org/wiki/File:Lancement_du_poids_par_l%27athl%C3%A8te_americain_McCraken_(1900).webm",
            "origin": "https://www.cinematheque.fr/",
            "archive": "Cinémathèque française / Wikimedia Commons",
            "retrieved": "2026-10-17",
            "via": None,
        },
        "rights": {
            "status": "public-domain",
            "license": "PD-old-100",
            "license_url": "https://commons.wikimedia.org/wiki/Template:PD-old-100",
            "credit": "Étienne-Jules Marey & Georges Demenÿ, 1900. Cinémathèque française / Wikimedia Commons. Public domain.",
            "notes": "",
        },
    },
    "saute-d-un-athlete-sweeney-par-dessus-une-barre-1900": {
        "title": "Saut en hauteur — Sweeney (Marey, 1900)",
        "status": "published",
        "summary": "High jumper Michael Sweeney clearing the bar, filmed by Étienne-Jules Marey in 1900.",
        "description": (
            "Chronophotographic high-speed film by Étienne-Jules Marey and Georges Demenÿ showing "
            "high jumper Michael Sweeney's approach, takeoff, bar clearance, and landing (Paris, 1900)."
        ),
        "tags": [
            "person",
            "single",
            "fullbody",
            "side",
            "static-camera",
            "movement",
            "jump",
            "sport",
            "slow",
            "bw",
            "silent",
            "early-film",
            "chronophotography",
            "archival",
        ],
        "keywords": ["Marey", "Sweeney", "high jump", "athletics", "1900", "biomechanics"],
        "demos": ["pose", "motion-trails", "optical-flow", "tracking"],
        "creators": [
            {"name": "Étienne-Jules Marey", "role": "director"},
            {"name": "Georges Demenÿ", "role": "cinematographer"},
            {"name": "Michael Sweeney", "role": "performer"},
        ],
        "date": "1900",
        "source": {
            "url": "https://commons.wikimedia.org/wiki/File:Saute_d%27un_athl%C3%A8te_(Sweeney)_par_dessus_une_barre_(1900).webm",
            "origin": "https://www.cinematheque.fr/",
            "archive": "Cinémathèque française / Wikimedia Commons",
            "retrieved": "2026-10-17",
            "via": None,
        },
        "rights": {
            "status": "public-domain",
            "license": "PD-old-100",
            "license_url": "https://commons.wikimedia.org/wiki/Template:PD-old-100",
            "credit": "Étienne-Jules Marey & Georges Demenÿ, 1900. Cinémathèque française / Wikimedia Commons. Public domain.",
            "notes": "",
        },
    },
    "anim-goeland-marey": {
        "title": "Vol du goéland — 3D Chronophotographic Sculpture (Marey, 1887)",
        "status": "published",
        "summary": "Animated zoetrope view of Étienne-Jules Marey's 1887 bronze sculpture of a seagull in flight.",
        "description": (
            "Étienne-Jules Marey sculpted successive wingbeat phases of a flying gull in bronze (1887) "
            "to capture three-dimensional kinematics beyond flat photographic plates. This looping GIF "
            "animates the bronze phases at the Cinémathèque française."
        ),
        "tags": [
            "animal",
            "object",
            "side",
            "movement",
            "cyclic",
            "repetitive",
            "short",
            "loop-friendly",
            "seamless-loop",
            "chronophotography",
            "archival",
        ],
        "keywords": ["Marey", "gull", "goéland", "flight", "wingbeat", "zoetrope", "sculpture"],
        "demos": ["loop", "motion-trails", "optical-flow", "tracking"],
        "creators": [
            {"name": "Étienne-Jules Marey", "role": "sculptor"},
            {"name": "uleli", "role": "gif"},
        ],
        "date": "1887",
        "source": {
            "url": "https://commons.wikimedia.org/wiki/File:Anim_go%C3%A9land_Marey.gif",
            "origin": "https://www.cinematheque.fr/",
            "archive": "Wikimedia Commons",
            "retrieved": "2026-10-17",
            "via": None,
        },
        "rights": {
            "status": "cc",
            "license": "CC-BY-SA-3.0",
            "license_url": "https://creativecommons.org/licenses/by-sa/3.0/",
            "credit": "Sculpture: Étienne-Jules Marey (1887, PD). Photograph/animation: uleli via Wikimedia Commons, CC BY-SA 3.0.",
            "notes": "",
        },
    },
    "animdemeny-je-vous-aime-planche": {
        "title": "« Je vous aime » — Phonoscope Lip-Reading Study (Demenÿ, 1891)",
        "status": "published",
        "summary": "Georges Demenÿ speaking 'Je vous aime' across 24 chronophotographic frames (1891).",
        "description": (
            "Recorded with the Phonoscope in 1891 so deaf students could study lip and facial articulation. "
            "Georges Demenÿ pronounces the French phrase 'Je vous aime' in close-up. Ideal for face-mesh, "
            "lip-reading, and facial blendshape demos."
        ),
        "tags": [
            "person",
            "single",
            "face",
            "closeup",
            "front",
            "talk",
            "gesture",
            "static-camera",
            "bw",
            "silent",
            "short",
            "loop-friendly",
            "frame-sequence",
            "early-film",
            "chronophotography",
            "archival",
        ],
        "keywords": ["Georges Demenÿ", "Phonoscope", "Je vous aime", "lip reading", "face", "1891"],
        "demos": ["face-mesh", "face-expression", "tts", "loop"],
        "creators": [{"name": "Georges Demenÿ", "role": "director"}],
        "date": "1891",
        "source": {
            "url": "https://commons.wikimedia.org/wiki/File:AnimDemen%C3%BF_Je_vous_aime_planche.gif",
            "origin": None,
            "archive": "Wikimedia Commons",
            "retrieved": "2026-10-17",
            "via": None,
        },
        "rights": {
            "status": "public-domain",
            "license": "PD-old-100",
            "license_url": "https://commons.wikimedia.org/wiki/Template:PD-old-100",
            "credit": "Georges Demenÿ, 1891. Phonoscope chronophotographic plate. Public domain.",
            "notes": "",
        },
    },
    "hapci-fr": {
        "title": "Fred Ott's Sneeze (Edison Kinetoscope, 1894)",
        "status": "published",
        "summary": "Fred Ott taking a pinch of snuff and sneezing for the Edison Kinetograph, January 1894.",
        "description": (
            "Officially titled 'Edison Kinetoscopic Record of a Sneeze', filmed by William K. L. Dickson "
            "in January 1894 starring Edison mechanic Fred Ott. The earliest surviving motion picture "
            "registered for U.S. copyright."
        ),
        "tags": [
            "person",
            "single",
            "upper-body",
            "face",
            "front",
            "gesture",
            "movement",
            "static-camera",
            "plain-bg",
            "bw",
            "silent",
            "short",
            "loop-friendly",
            "reaction",
            "early-film",
            "archival",
        ],
        "keywords": ["Fred Ott", "sneeze", "Edison", "Dickson", "1894", "Kinetoscope"],
        "demos": ["face-mesh", "face-expression", "pose", "loop"],
        "creators": [
            {"name": "William K. L. Dickson", "role": "director"},
            {"name": "Fred Ott", "role": "performer"},
        ],
        "date": "1894-01-09",
        "source": {
            "url": "https://commons.wikimedia.org/wiki/File:Hapci-fr.gif",
            "origin": "https://www.loc.gov/item/00694192/",
            "archive": "Library of Congress / Wikimedia Commons",
            "retrieved": "2026-10-17",
            "via": None,
        },
        "rights": {
            "status": "public-domain",
            "license": "PD-US",
            "license_url": "https://commons.wikimedia.org/wiki/Template:PD-US",
            "credit": "William K. L. Dickson / Edison Manufacturing Co., 1894. Library of Congress. Public domain.",
            "notes": "",
        },
    },
    "louie-fuller": {
        "title": "Serpentine Dance — Rose Swirl Loop (1897)",
        "status": "published",
        "summary": "Short animated GIF loop extracted from the 1897 Lumière hand-tinted serpentine dance film.",
        "description": (
            "A compact GIF excerpt from Auguste and Louis Lumière's 1897 stencil-tinted 'Danse serpentine', "
            "isolating the billowing rose-tinted silk rotation."
        ),
        "derived_from": "danse-serpentine-lumiere-1897",
        "tags": [
            "person",
            "single",
            "fullbody",
            "front",
            "dance",
            "movement",
            "cyclic",
            "static-camera",
            "plain-bg",
            "tinted",
            "silent",
            "short",
            "loop-friendly",
            "found-gif",
            "early-film",
            "archival",
        ],
        "keywords": ["Loïe Fuller", "serpentine dance", "Lumière", "loop", "silk"],
        "demos": ["optical-flow", "motion-trails", "color", "loop"],
        "creators": [{"name": "Auguste and Louis Lumière", "role": "producer"}],
        "date": "1897",
        "source": {
            "url": "https://en.wikipedia.org/wiki/File:Danse_serpentine_(Lumi%C3%A8re,_1897).webm",
            "origin": "https://catalogue-lumiere.com/danse-serpentine/",
            "archive": "Catalogue Lumière / Wikimedia",
            "retrieved": "2026-10-17",
            "via": "danse-serpentine-lumiere-1897",
        },
        "rights": {
            "status": "public-domain",
            "license": "PD-US",
            "license_url": "https://commons.wikimedia.org/wiki/Template:PD-US",
            "credit": "Auguste and Louis Lumière, 1897 (Catalogue Lumière no. 765). Public domain.",
            "notes": "",
        },
    },
    "cockatoo-muybrige": {
        "title": "Cockatoo Flying — Animal Locomotion Plate 758 (Muybridge, 1887)",
        "status": "published",
        "summary": "Seamless chronophotographic loop of a sulphur-crested cockatoo in flight, Eadweard Muybridge, 1887.",
        "description": (
            "Animated sequence from Eadweard Muybridge's 'Animal Locomotion' (1887), Plate 758, capturing "
            "a full wingbeat cycle of a cockatoo flying from left to right against a measured reference grid."
        ),
        "plate": "758",
        "sequence": "Animal Locomotion (1887)",
        "tags": [
            "animal",
            "side",
            "movement",
            "cyclic",
            "repetitive",
            "static-camera",
            "plain-bg",
            "bw",
            "silent",
            "short",
            "loop-friendly",
            "seamless-loop",
            "frame-sequence",
            "chronophotography",
            "archival",
        ],
        "keywords": ["Eadweard Muybridge", "cockatoo", "bird", "flight", "wingbeat", "Plate 758"],
        "demos": ["loop", "optical-flow", "motion-trails", "tracking"],
        "creators": [{"name": "Eadweard Muybridge", "role": "photographer"}],
        "date": "1887",
        "source": {
            "url": "https://commons.wikimedia.org/wiki/File:Cockatoo-Muybrige.gif",
            "origin": "https://www.loc.gov/pictures/item/91482192/",
            "archive": "Library of Congress / Wikimedia Commons",
            "retrieved": "2026-10-17",
            "via": None,
        },
        "rights": {
            "status": "public-domain",
            "license": "PD-old-100",
            "license_url": "https://commons.wikimedia.org/wiki/Template:PD-old-100",
            "credit": "Eadweard Muybridge, Animal Locomotion, Plate 758, 1887. Public domain.",
            "notes": "",
        },
    },
    "eadweard-muybridge-animal-locomotion-woman-dancing-fancy-1887-plate-187": {
        "title": "Woman Dancing (Fancy) — Plate 187 (Muybridge, 1887)",
        "status": "published",
        "summary": "Twelve-frame chronophotographic loop of a woman twirling in a sheer dress, Eadweard Muybridge, 1887.",
        "description": (
            "Animated from Eadweard Muybridge's 'Animal Locomotion' (1887), Plate 187 ('Woman dancing, fancy'). "
            "Shows a complete rotational pirouette in front of a gridded backdrop."
        ),
        "plate": "187",
        "sequence": "Animal Locomotion (1887)",
        "tags": [
            "person",
            "single",
            "fullbody",
            "front",
            "dance",
            "movement",
            "cyclic",
            "static-camera",
            "plain-bg",
            "bw",
            "silent",
            "short",
            "loop-friendly",
            "seamless-loop",
            "frame-sequence",
            "chronophotography",
            "archival",
        ],
        "keywords": ["Eadweard Muybridge", "Plate 187", "woman dancing", "pirouette", "locomotion"],
        "demos": ["pose", "loop", "motion-trails", "segmentation"],
        "creators": [{"name": "Eadweard Muybridge", "role": "photographer"}],
        "date": "1887",
        "source": {
            "url": "https://commons.wikimedia.org/wiki/File:Eadweard_Muybridge,_Animal_Locomotion,_Woman_Dancing_(fancy),_1887,_plate_187.gif",
            "origin": "https://commons.wikimedia.org/wiki/Category:Animal_Locomotion_(1887)",
            "archive": "Wikimedia Commons",
            "retrieved": "2026-10-17",
            "via": None,
        },
        "rights": {
            "status": "public-domain",
            "license": "PD-old-100",
            "license_url": "https://commons.wikimedia.org/wiki/Template:PD-old-100",
            "credit": "Eadweard Muybridge, Animal Locomotion, Plate 187, 1887. Public domain.",
            "notes": "",
        },
    },
    "woman-in-dress-dancing-1887": {
        "title": "Woman in Dress Dancing — High-Res Plate 187 (Muybridge, 1887)",
        "status": "published",
        "summary": "High-resolution crop of Eadweard Muybridge's Plate 187 dancing sequence (1887).",
        "description": (
            "Higher-resolution transfer of Eadweard Muybridge's Plate 187 ('Woman dancing, fancy', 1887), "
            "preserving fine drapery folds and halftone grain across the rotation cycle."
        ),
        "plate": "187",
        "sequence": "Animal Locomotion (1887)",
        "tags": [
            "person",
            "single",
            "fullbody",
            "front",
            "dance",
            "movement",
            "cyclic",
            "static-camera",
            "plain-bg",
            "bw",
            "grain",
            "silent",
            "short",
            "loop-friendly",
            "frame-sequence",
            "chronophotography",
            "archival",
        ],
        "keywords": ["Eadweard Muybridge", "Plate 187", "dance", "drapery", "chronophotography"],
        "demos": ["pose", "loop", "optical-flow", "motion-trails"],
        "creators": [{"name": "Eadweard Muybridge", "role": "photographer"}],
        "date": "1887",
        "source": {
            "url": "https://commons.wikimedia.org/wiki/File:Woman_in_dress_dancing_(1887).gif",
            "origin": "https://commons.wikimedia.org/wiki/Category:Animal_Locomotion_(1887)",
            "archive": "Wikimedia Commons",
            "retrieved": "2026-10-17",
            "via": None,
        },
        "rights": {
            "status": "public-domain",
            "license": "PD-old-100",
            "license_url": "https://commons.wikimedia.org/wiki/Template:PD-old-100",
            "credit": "Eadweard Muybridge, Animal Locomotion, Plate 187, 1887. Public domain.",
            "notes": "",
        },
    },
    "muybridge-human-male-walking-animated": {
        "title": "Human Male Walking — Animal Locomotion Plate 1 (Muybridge, 1887)",
        "status": "published",
        "summary": "Dual-angle (lateral and rear) walking gait cycle from Eadweard Muybridge's Animal Locomotion, 1887.",
        "description": (
            "Synchronized lateral and rear-view chronophotographic walk cycle from Eadweard Muybridge's "
            "'Animal Locomotion' (1887). Includes generated sprite sheet (sheet.png) and numbered frame archive "
            "(frames.zip) for p5.js sprite animation and pose-estimation exercises."
        ),
        "plate": "1",
        "sequence": "Animal Locomotion (1887)",
        "tags": [
            "person",
            "single",
            "fullbody",
            "side",
            "back",
            "walk",
            "movement",
            "cyclic",
            "repetitive",
            "static-camera",
            "plain-bg",
            "bw",
            "silent",
            "short",
            "loop-friendly",
            "seamless-loop",
            "frame-sequence",
            "chronophotography",
            "archival",
        ],
        "keywords": ["Eadweard Muybridge", "walking", "gait cycle", "sprite sheet", "locomotion"],
        "demos": ["pose", "loop", "tracking", "rigging", "motion-trails"],
        "creators": [{"name": "Eadweard Muybridge", "role": "photographer"}],
        "date": "1887",
        "source": {
            "url": "https://commons.wikimedia.org/wiki/File:Muybridge_human_male_walking_animated.gif",
            "origin": "https://commons.wikimedia.org/wiki/Category:Animal_Locomotion_(1887)",
            "archive": "Wikimedia Commons",
            "retrieved": "2026-10-17",
            "via": None,
        },
        "rights": {
            "status": "public-domain",
            "license": "PD-old-100",
            "license_url": "https://commons.wikimedia.org/wiki/Template:PD-old-100",
            "credit": "Eadweard Muybridge, Animal Locomotion, 1887. Public domain.",
            "notes": "",
        },
    },
    "muybridge-race-horse-animated": {
        "title": "The Horse in Motion — Annie G. Galloping (Muybridge, 1887)",
        "status": "published",
        "summary": "Twelve-frame galloping stride of racehorse Annie G., Eadweard Muybridge, Plate 626, 1887.",
        "description": (
            "Iconic chronophotographic sequence from Eadweard Muybridge's 'Animal Locomotion' (Plate 626, 1887) "
            "demonstrating the airborne suspension phase of a galloping horse. Includes generated sprite sheet "
            "(sheet.png) and frames.zip."
        ),
        "plate": "626",
        "sequence": "Animal Locomotion (1887)",
        "tags": [
            "animal",
            "person",
            "side",
            "run",
            "movement",
            "cyclic",
            "repetitive",
            "fast",
            "static-camera",
            "plain-bg",
            "bw",
            "silent",
            "short",
            "loop-friendly",
            "seamless-loop",
            "frame-sequence",
            "chronophotography",
            "archival",
        ],
        "keywords": ["Eadweard Muybridge", "horse", "gallop", "Annie G", "Plate 626", "sprite"],
        "demos": ["loop", "object-detection", "tracking", "motion-trails"],
        "creators": [{"name": "Eadweard Muybridge", "role": "photographer"}],
        "date": "1887",
        "source": {
            "url": "https://commons.wikimedia.org/wiki/File:Muybridge_race_horse_animated.gif",
            "origin": "https://www.loc.gov/pictures/item/97502309/",
            "archive": "Library of Congress / Wikimedia Commons",
            "retrieved": "2026-10-17",
            "via": None,
        },
        "rights": {
            "status": "public-domain",
            "license": "PD-old-100",
            "license_url": "https://commons.wikimedia.org/wiki/Template:PD-old-100",
            "credit": "Eadweard Muybridge, Animal Locomotion, Plate 626, 1887. Library of Congress. Public domain.",
            "notes": "",
        },
    },
    "nburling-public": {
        "title": "Couple Waltzing — Animal Locomotion Plate 189 (Muybridge, 1887)",
        "status": "published",
        "summary": "Man and woman turning in a waltz, Eadweard Muybridge, Animal Locomotion Plate 189, 1887.",
        "description": (
            "Chronophotographic loop of a couple waltzing from Eadweard Muybridge's 'Animal Locomotion' "
            "(Plate 189, 1887). Useful for two-person occlusion testing in pose estimation and segmentation."
        ),
        "plate": "189",
        "sequence": "Animal Locomotion (1887)",
        "tags": [
            "person",
            "pair",
            "fullbody",
            "dance",
            "movement",
            "cyclic",
            "static-camera",
            "plain-bg",
            "bw",
            "silent",
            "short",
            "loop-friendly",
            "frame-sequence",
            "chronophotography",
            "archival",
        ],
        "keywords": ["Eadweard Muybridge", "waltz", "couple", "Plate 189", "occlusion"],
        "demos": ["pose", "segmentation", "tracking", "loop"],
        "creators": [{"name": "Eadweard Muybridge", "role": "photographer"}],
        "date": "1887",
        "source": {
            "url": "https://commons.wikimedia.org/wiki/File:Eadweard_Muybridge,_Animal_Locomotion,_Waltzing,_couple,_1887,_plate_189.jpg",
            "origin": "https://commons.wikimedia.org/wiki/Category:Animal_Locomotion_(1887)",
            "archive": "University of Pennsylvania Archives / Wikimedia Commons",
            "retrieved": "2026-10-17",
            "via": None,
        },
        "rights": {
            "status": "public-domain",
            "license": "PD-old-100",
            "license_url": "https://commons.wikimedia.org/wiki/Template:PD-old-100",
            "credit": "Eadweard Muybridge, Animal Locomotion, Plate 189, 1887. Public domain.",
            "notes": "",
        },
    },
    "tristan-tzara": {
        "title": "Portrait of Tristan Tzara (Robert Delaunay, 1923)",
        "status": "published",
        "summary": "Oil portrait of Dada poet Tristan Tzara wearing a concentric scarf, painted by Robert Delaunay, 1923.",
        "description": (
            "Robert Delaunay's 1923 Orphist portrait of Dada co-founder Tristan Tzara (oil on cardboard, "
            "Museo Nacional Centro de Arte Reina Sofía, Madrid). Strong chromatic contrast and geometric planes "
            "make it well suited for color palette extraction and neural style transfer demos."
        ),
        "tags": [
            "person",
            "single",
            "upper-body",
            "face",
            "three-quarter",
            "still",
            "color",
            "painting",
            "portrait",
            "archival",
        ],
        "keywords": ["Tristan Tzara", "Robert Delaunay", "Dada", "Orphism", "1923", "portrait"],
        "demos": ["color", "style-transfer", "img2img", "face-mesh", "texture"],
        "creators": [
            {"name": "Robert Delaunay", "role": "painter"},
            {"name": "Tristan Tzara", "role": "subject"},
        ],
        "date": "1923",
        "source": {
            "url": "https://commons.wikimedia.org/wiki/File:Retrato_de_Tristan_Tzara_(Robert_Delaunay).jpg",
            "origin": "https://www.museoreinasofia.es/en/collection/artwork/portrait-tristan-tzara",
            "archive": "Museo Nacional Centro de Arte Reina Sofía / Wikimedia Commons",
            "retrieved": "2026-10-17",
            "via": None,
        },
        "rights": {
            "status": "public-domain",
            "license": "PD-old-70",
            "license_url": "https://commons.wikimedia.org/wiki/Template:PD-old-70",
            "credit": "Robert Delaunay, Portrait of Tristan Tzara, 1923. Museo Reina Sofía / Wikimedia Commons. Public domain.",
            "notes": "",
        },
    },
    "hugo-ball": {
        "title": "Hugo Ball at Cabaret Voltaire (Zurich, 1916)",
        "status": "published",
        "summary": "Hugo Ball in cylindrical cardboard shaman costume reciting the sound poem 'Karawane', Zurich, 1916.",
        "description": (
            "Iconic Dada photograph of Hugo Ball performing his phonetic sound poem 'Karawane' in a rigid "
            "cylindrical cardboard costume and Marcel Janco backdrop at Cabaret Voltaire, Zurich, June 1916."
        ),
        "tags": [
            "person",
            "single",
            "fullbody",
            "front",
            "pose",
            "still",
            "bw",
            "high-contrast",
            "photo",
            "archival",
        ],
        "keywords": ["Hugo Ball", "Cabaret Voltaire", "Dada", "Karawane", "Zurich", "1916", "sound poetry"],
        "demos": ["pose", "segmentation", "img2img", "typography", "generative-text"],
        "creators": [{"name": "Hugo Ball", "role": "performer"}],
        "date": "1916-06-23",
        "source": {
            "url": "https://commons.wikimedia.org/wiki/File:Hugo_Ball_at_Cabaret_Voltaire_(1916).jpg",
            "origin": "https://en.wikipedia.org/wiki/Cabaret_Voltaire_(Zurich)",
            "archive": "Wikimedia Commons",
            "retrieved": "2026-10-17",
            "via": None,
        },
        "rights": {
            "status": "public-domain",
            "license": "PD-old-100",
            "license_url": "https://commons.wikimedia.org/wiki/Template:PD-old-100",
            "credit": "Hugo Ball at Cabaret Voltaire, Zurich, 1916. Public domain.",
            "notes": "",
        },
    },
    "andre-breton": {
        "title": "André Breton in Tinted Spectacles (Photomaton, c. 1929)",
        "status": "published",
        "summary": "Close-up Photomaton portrait of Surrealist poet André Breton adjusting round spectacles.",
        "description": (
            "Photobooth (Photomaton) portrait of Surrealist writer André Breton holding the frames of his "
            "round tinted glasses with both hands. Symmetrical frontal framing of face and hands makes it "
            "ideal for simultaneous MediaPipe face-mesh and hand-landmark detection."
        ),
        "tags": [
            "person",
            "single",
            "face",
            "hands",
            "closeup",
            "front",
            "gesture",
            "still",
            "tinted",
            "plain-bg",
            "photo",
            "square",
            "archival",
        ],
        "keywords": ["André Breton", "Surrealism", "Photomaton", "glasses", "hands", "portrait"],
        "demos": ["face-mesh", "hands", "face-expression", "depth", "img2img"],
        "creators": [{"name": "André Breton", "role": "subject"}],
        "date": "1929",
        "source": {
            "url": "https://www.andrebreton.fr/work/56600100235000",
            "origin": "https://www.centrepompidou.fr/",
            "archive": "Atelier André Breton",
            "retrieved": "2026-10-17",
            "via": None,
        },
        "rights": {
            "status": "public-domain",
            "license": "PD-Anon-1929",
            "license_url": "https://commons.wikimedia.org/wiki/Template:PD-US",
            "credit": "Anonymous Photomaton portrait of André Breton, c. 1929. Atelier André Breton. Public domain.",
            "notes": "",
        },
    },
    "wayang-female-transparent": {
        "title": "Wayang Kulit Articulated Puppet Sheet (Transparent PNG)",
        "status": "published",
        "summary": "Javanese shadow-puppet figure with separated upper and lower arm segments on transparent alpha.",
        "description": (
            "High-contrast monochrome cutout of a traditional Javanese Wayang Kulit puppet with its torso "
            "and four articulated arm/hand pieces laid out with pivot holes on a transparent alpha background. "
            "Designed for 2D forward/inverse kinematics rigging and pose-driven puppetry in p5.js or Three.js."
        ),
        "tags": [
            "person",
            "object",
            "single",
            "fullbody",
            "side",
            "bw",
            "high-contrast",
            "plain-bg",
            "silhouette",
            "portrait",
            "transparent",
            "alpha",
            "drawing",
        ],
        "keywords": ["Wayang Kulit", "puppet", "rigging", "cutout", "joints", "silhouette", "alpha"],
        "demos": ["rigging", "pose", "segmentation", "body-zones"],
        "creators": [{"name": "Mediathèque Teaching Lab", "role": "preparer"}],
        "date": "2026",
        "source": {
            "url": "https://languel.github.io/mediatheque/items/wayang-female-transparent/media.webp",
            "origin": "https://commons.wikimedia.org/wiki/Category:Wayang_kulit",
            "archive": "Mediathèque Teaching Collection",
            "retrieved": "2026-10-17",
            "via": None,
        },
        "rights": {
            "status": "public-domain",
            "license": "CC0-1.0",
            "license_url": "https://creativecommons.org/publicdomain/zero/1.0/",
            "credit": "Traditional Wayang Kulit articulated puppet sheet, prepared for Mediathèque (CC0 1.0).",
            "notes": "",
        },
    },
    "pileus-logo": {
        "title": "Pileus Cloud Emblem (SVG Vector)",
        "status": "published",
        "summary": "Spiral cloud and pileus cap vector emblem in clean SVG paths.",
        "description": (
            "Clean geometric vector emblem depicting a spiraling cumulus cloud beneath a lenticular pileus "
            "cap. Sanitized SVG suitable for path resampling, pen-plotter toolpaths, and signed-distance field demos."
        ),
        "tags": [
            "abstract",
            "pattern",
            "square",
            "transparent",
            "filled",
            "line-art",
            "plotter-ready",
            "icon",
            "contemporary",
            "own-capture",
        ],
        "keywords": ["pileus", "cloud", "spiral", "vector", "SVG", "logo", "plotter"],
        "demos": ["plotter", "typography", "texture"],
        "creators": [{"name": "Mediathèque Teaching Lab", "role": "designer"}],
        "date": "2026",
        "source": {
            "url": "https://languel.github.io/mediatheque/items/pileus-logo/media.svg",
            "origin": None,
            "archive": "Mediathèque Teaching Collection",
            "retrieved": "2026-10-18",
            "via": None,
        },
        "rights": {
            "status": "cc",
            "license": "CC0-1.0",
            "license_url": "https://creativecommons.org/publicdomain/zero/1.0/",
            "credit": "Pileus emblem SVG, Mediathèque Teaching Collection (CC0 1.0).",
            "notes": "",
        },
    },
    "mh-4-gallery": {
        "title": "Memorial Hall 4th Floor Gallery (3D Scan GLB)",
        "status": "published",
        "summary": "Textured 3D LiDAR/photogrammetry room scan of the Memorial Hall 4th floor gallery space.",
        "description": (
            "3D architectural room scan of a 4th-floor exhibition gallery in Memorial Hall, exported as "
            "a binary glTF (.glb) mesh with vertex/texture colors. Useful for Three.js exhibition layout, "
            "camera path, and spatial projection mapping exercises."
        ),
        "tags": [
            "interior",
            "three-quarter",
            "scene",
            "architecture",
            "scan",
            "textured",
            "contemporary",
            "own-capture",
        ],
        "keywords": ["Memorial Hall", "gallery", "3D scan", "GLB", "architecture", "interior", "LiDAR"],
        "demos": ["3d-viewer", "photogrammetry", "projection", "depth"],
        "creators": [{"name": "Mediathèque Spatial Lab", "role": "scanner"}],
        "date": "2026-09-20",
        "source": {
            "url": "https://languel.github.io/mediatheque/items/mh-4-gallery/media.glb",
            "origin": None,
            "archive": "Mediathèque Spatial Collection",
            "retrieved": "2026-09-20",
            "via": None,
        },
        "rights": {
            "status": "cc",
            "license": "CC-BY-4.0",
            "license_url": "https://creativecommons.org/licenses/by/4.0/",
            "credit": "Memorial Hall 4th Floor Gallery 3D Scan, Mediathèque Spatial Lab, 2026 (CC BY 4.0).",
            "notes": "",
        },
    },
    "arcf9-1-poly": {
        "title": "Architectural Coffered Vault Fragment (3D Scan GLB)",
        "status": "published",
        "summary": "Dense photogrammetry mesh scan of a structural architectural ceiling bay (.glb).",
        "description": (
            "High-density photogrammetry capture of an architectural ceiling/structural bay with surface "
            "patina, exported as glTF binary (.glb) for lighting, normal-map, and 3D viewer studies."
        ),
        "tags": [
            "object",
            "three-quarter",
            "architecture",
            "scan",
            "textured",
            "contemporary",
            "own-capture",
        ],
        "keywords": ["photogrammetry", "architecture", "vault", "ceiling", "GLB", "mesh"],
        "demos": ["3d-viewer", "photogrammetry", "texture", "depth"],
        "creators": [{"name": "Mediathèque Spatial Lab", "role": "scanner"}],
        "date": "2026-09-20",
        "source": {
            "url": "https://languel.github.io/mediatheque/items/arcf9-1-poly/media.glb",
            "origin": None,
            "archive": "Mediathèque Spatial Collection",
            "retrieved": "2026-09-20",
            "via": None,
        },
        "rights": {
            "status": "cc",
            "license": "CC-BY-4.0",
            "license_url": "https://creativecommons.org/licenses/by/4.0/",
            "credit": "Architectural Vault 3D Scan (arcf9-1-poly), Mediathèque Spatial Lab, 2026 (CC BY 4.0).",
            "notes": "",
        },
    },
    "snowy-dystopian-eastern-european-city": {
        "title": "Snowy Concrete Courtyard Pavilion (Gaussian Splat .spz)",
        "status": "published",
        "summary": "500,000-point compressed 3D Gaussian Splat (.spz v2) of a snow-covered brutalist courtyard.",
        "description": (
            "Compressed Niantic SPZ v2 3D Gaussian Splat scene (500,000 splats, SH degree 0, 10-bit fixed-point "
            "coordinates) depicting a snow-covered brutalist structure and surrounding trees at dusk."
        ),
        "tags": [
            "cityscape",
            "landscape",
            "three-quarter",
            "outdoor",
            "360",
            "generated",
            "contemporary",
        ],
        "keywords": ["Gaussian splat", "SPZ", "snow", "brutalist", "3DGS", "radiance field"],
        "demos": ["splat-viewer", "depth", "3d-viewer"],
        "creators": [{"name": "Mediathèque Spatial Lab", "role": "generated-with"}],
        "date": "2026-03-19",
        "source": {
            "url": "https://languel.github.io/mediatheque/items/snowy-dystopian-eastern-european-city/media.spz",
            "origin": None,
            "archive": "Mediathèque Spatial Collection",
            "retrieved": "2026-03-19",
            "via": None,
        },
        "rights": {
            "status": "cc",
            "license": "CC-BY-4.0",
            "license_url": "https://creativecommons.org/licenses/by/4.0/",
            "credit": "Snowy Concrete Courtyard Gaussian Splat (.spz), Mediathèque Spatial Collection, 2026 (CC BY 4.0).",
            "notes": "",
        },
    },
    "countconstantdelay0": {
        "title": "Zero-Delay Frame Counter Test GIF",
        "status": "published",
        "summary": "Synthetic 10-frame GIF with 0ms frame delay headers for browser/decoder timing tests.",
        "description": (
            "Diagnostic animated GIF counting frames with constant 0ms header delay to test how browsers, "
            "ffmpeg, and creative-coding runtimes clamp sub-10ms GIF frame durations."
        ),
        "tags": [
            "text-content",
            "abstract",
            "bw",
            "plain-bg",
            "short",
            "square",
            "loop-friendly",
            "low-palette",
            "pixel-art",
            "frame-sequence",
            "contemporary",
        ],
        "keywords": ["test pattern", "GIF timing", "0ms delay", "frame counter", "decoder"],
        "demos": ["loop", "typography"],
        "creators": [{"name": "Mediathèque Teaching Lab", "role": "author"}],
        "date": "2026",
        "source": {
            "url": "https://languel.github.io/mediatheque/items/countconstantdelay0/original.gif",
            "origin": None,
            "archive": "Mediathèque Test Suite",
            "retrieved": "2026-03-26",
            "via": None,
        },
        "rights": {
            "status": "public-domain",
            "license": "CC0-1.0",
            "license_url": "https://creativecommons.org/publicdomain/zero/1.0/",
            "credit": "GIF timing diagnostic test asset, Mediathèque (CC0 1.0).",
            "notes": "",
        },
    },
    "rectangles": {
        "title": "Primary Rectangles Palette Study (GIF)",
        "status": "published",
        "summary": "Minimal multi-frame geometric color rectangle study for palette quantization demos.",
        "description": (
            "Minimalist geometric GIF composed of flat color rectangles for testing palette extraction, "
            "indexed color tables, and crisp pixel-art scaling."
        ),
        "tags": [
            "abstract",
            "pattern",
            "color",
            "plain-bg",
            "short",
            "loop-friendly",
            "low-palette",
            "pixel-art",
            "contemporary",
        ],
        "keywords": ["rectangles", "geometry", "palette", "indexed color", "test pattern"],
        "demos": ["color", "loop", "texture"],
        "creators": [{"name": "Mediathèque Teaching Lab", "role": "author"}],
        "date": "2026",
        "source": {
            "url": "https://languel.github.io/mediatheque/items/rectangles/original.gif",
            "origin": None,
            "archive": "Mediathèque Test Suite",
            "retrieved": "2026-09-17",
            "via": None,
        },
        "rights": {
            "status": "public-domain",
            "license": "CC0-1.0",
            "license_url": "https://creativecommons.org/publicdomain/zero/1.0/",
            "credit": "Primary Rectangles study, Mediathèque (CC0 1.0).",
            "notes": "",
        },
    },
    # --- DRAFT / REVIEW QUEUE ITEMS (fair-use teaching or unverified rights kept out of published catalog) ---
    "metastaseis2": {
        "title": "Xenakis — Metastaseis Glissandi Graph (mm. 317–333, 1953–54)",
        "status": "draft",
        "summary": "Iannis Xenakis's ruled-surface pitch vs. time graphic score for string glissandi in Metastaseis.",
        "description": (
            "Graphic pitch-time diagram by Iannis Xenakis for measures 317–333 of 'Metastaseis' (1953–54), "
            "published in 'Musique. Architecture' (Tournai: Casterman, 1976, p. 8), showing 46 string voices "
            "forming hyperbolic paraboloid ruled surfaces."
        ),
        "tags": ["abstract", "text-content", "bw", "plain-bg", "portrait", "archival"],
        "keywords": ["Iannis Xenakis", "Metastaseis", "glissandi", "ruled surface", "graphic score", "1954"],
        "demos": ["sonification", "plotter", "midi"],
        "creators": [{"name": "Iannis Xenakis", "role": "composer"}],
        "date": "1954",
        "source": {
            "url": "https://medium.com/@risingskies2/project-3-sound-ambience-iannis-xenakis-65d62dc4b640",
            "origin": "Iannis Xenakis, Musique. Architecture, Tournai: Casterman, 1976, p. 8",
            "archive": "Archival scan (fair-use teaching)",
            "retrieved": "2026-07-25",
            "via": None,
        },
        "rights": {
            "status": "fair-use-teaching",
            "license": "Fair-Use-Teaching",
            "license_url": None,
            "credit": "Iannis Xenakis, Metastaseis (1953–54), mm. 317–333 graphic score, in Musique. Architecture (Casterman, 1976, p. 8).",
            "notes": "Kept in draft (classroom teaching reference only; under copyright of Estate of Iannis Xenakis).",
        },
    },
    "giphy-1": {
        "title": "Oskar Schlemmer — Triadisches Ballett (Disc Costumes Loop)",
        "status": "draft",
        "summary": "Two dancers in metallic disc costumes from Oskar Schlemmer's Bauhaus Triadic Ballet (1970 reconstruction).",
        "description": (
            "Short loop from the 1970 Bavaria Atelier film reconstruction of Oskar Schlemmer's 1922 Bauhaus "
            "'Triadisches Ballett' showing two performers in circular metallic torso discs against black."
        ),
        "tags": [
            "person",
            "pair",
            "fullbody",
            "side",
            "dance",
            "movement",
            "plain-bg",
            "color",
            "short",
            "loop-friendly",
            "found-gif",
        ],
        "keywords": ["Oskar Schlemmer", "Triadic Ballet", "Bauhaus", "costume", "geometry"],
        "demos": ["pose", "body-zones", "segmentation"],
        "creators": [{"name": "Oskar Schlemmer", "role": "choreographer"}],
        "date": "1922",
        "source": {
            "url": None,
            "origin": "https://en.wikipedia.org/wiki/Triadic_Ballet",
            "archive": "Bavaria Atelier (1970 reconstruction)",
            "retrieved": "2026-06-12",
            "via": None,
        },
        "rights": {
            "status": "fair-use-teaching",
            "license": "Fair-Use-Teaching",
            "license_url": None,
            "credit": "Oskar Schlemmer, Das Triadische Ballett (1922; 1970 Bavaria Atelier reconstruction).",
            "notes": "1970 film reconstruction remains under broadcast copyright; kept in draft.",
        },
    },
    "street-view-mh": {
        "title": "Street View — Memorial Hall Exterior",
        "status": "draft",
        "summary": "Panoramic street-level view outside Memorial Hall on Pratt Institute campus.",
        "tags": ["cityscape", "color", "panorama", "landscape-format", "contemporary"],
        "keywords": ["Street View", "Memorial Hall", "Pratt Institute", "Brooklyn", "panorama"],
        "demos": ["projection", "depth"],
        "creators": [],
        "date": "2026",
        "rights": {
            "status": "unknown",
            "license": None,
            "license_url": None,
            "credit": "",
            "notes": "Google Street View screenshot; kept in draft pending own-capture replacement.",
        },
    },
    "streetview-pratt-cannon": {
        "title": "Street View — Pratt Campus Cannon Lawn",
        "status": "draft",
        "summary": "Panoramic capture of the Pratt Institute main lawn and historic cannon.",
        "tags": ["landscape", "cityscape", "color", "panorama", "landscape-format", "contemporary"],
        "keywords": ["Pratt Institute", "cannon", "campus", "panorama"],
        "demos": ["projection", "depth"],
        "creators": [],
        "date": "2026",
        "rights": {
            "status": "unknown",
            "license": None,
            "license_url": None,
            "credit": "",
            "notes": "Google Street View screenshot; kept in draft pending own-capture replacement.",
        },
    },
    "birds": {
        "title": "Seagulls Over Sunset Horizon (Video Sample)",
        "status": "draft",
        "summary": "Flock of gulls flying across a low sun over water.",
        "tags": ["animal", "landscape", "wide", "movement", "color", "silhouette", "short", "contemporary"],
        "keywords": ["birds", "seagulls", "sunset", "flock", "water"],
        "demos": ["object-detection", "optical-flow", "tracking"],
        "creators": [],
        "date": "2026",
        "rights": {
            "status": "unknown",
            "license": None,
            "license_url": None,
            "credit": "",
            "notes": "Source URL and license unverified; kept in draft.",
        },
    },
    "muted-b": {
        "title": "Short Motion Study (muted_b)",
        "status": "draft",
        "summary": "Short unattributed motion test clip.",
        "tags": ["movement", "short", "silent", "contemporary"],
        "keywords": ["test clip"],
        "demos": ["optical-flow"],
        "creators": [],
        "date": "2026",
        "rights": {
            "status": "unknown",
            "license": None,
            "license_url": None,
            "credit": "",
            "notes": "Source URL and license unverified; kept in draft.",
        },
    },
}


def run_enrichment() -> None:
    valid_tags, valid_demos = load_valid_tags(REPO_ROOT)
    today = str(date.today())

    for item_id, patch in ENRICHMENTS.items():
        item_path = REPO_ROOT / "items" / item_id / "item.json"
        if not item_path.exists():
            print(f"[warn] missing {item_id}")
            continue

        item = json.loads(item_path.read_text(encoding="utf-8"))

        for key in ("title", "status", "summary", "description", "keywords", "creators", "date", "derived_from", "plate", "sequence", "clips"):
            if key in patch:
                item[key] = patch[key]

        if "source" in patch:
            item.setdefault("source", {}).update(patch["source"])
        if "rights" in patch:
            item.setdefault("rights", {}).update(patch["rights"])

        if "tags" in patch:
            merged_tags = list(dict.fromkeys([*patch["tags"], *item.get("tags", [])]))
            item["tags"] = [t for t in merged_tags if t in valid_tags]
        if "demos" in patch:
            merged_demos = list(dict.fromkeys([*patch["demos"], *item.get("demos", [])]))
            item["demos"] = [d for d in merged_demos if d in valid_demos]

        item["updated"] = today
        item_path.write_text(json.dumps(item, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    # Generate sprite sheets and frame archives for the two primary Muybridge locomotion items
    for anim_id in ("muybridge-human-male-walking-animated", "muybridge-race-horse-animated"):
        sheet_file = REPO_ROOT / "items" / anim_id / "sheet.png"
        if not sheet_file.exists():
            generate_gif_frames_and_sheet(anim_id)

    print(f"[enrich] enriched {len(ENRICHMENTS)} items.")


if __name__ == "__main__":
    run_enrichment()
