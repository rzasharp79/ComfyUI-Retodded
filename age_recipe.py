import bisect
import re

from typing_extensions import override

from comfy_api.latest import io

MIN_AGE, MAX_AGE, MAX_AGES = 20, 100, 10
AGES_ERROR = f"Ages must be whole numbers from {MIN_AGE} to {MAX_AGE}, separated by commas, for example 40, 50, 60."

TABLE_AGES = (30, 40, 50, 60, 70, 80)
# (phrase, word scale, modifier group, intensity 0..1 at TABLE_AGES). Skin rows follow the dermatology research in
# docs/superpowers/specs/2026-09-24-age-accurate-texture-design.md; shape rows are design choices. The first row is
# also the texture_amount output.
FEATURES = (
    ("fine lines across the skin", "count", "sun", (.10, .25, .45, .65, .85, 1.0)),
    ("crow's feet at the outer eye corners", "line", "sun", (.15, .35, .55, .75, .90, 1.0)),
    ("fine lines under the eyes", "line", "", (.10, .30, .50, .70, .85, 1.0)),
    ("horizontal forehead lines", "line", "sun", (.15, .30, .50, .65, .80, .90)),
    ("frown lines between the brows", "line", "", (.05, .25, .45, .60, .75, .85)),
    ("nasolabial folds", "line", "", (.15, .30, .50, .70, .85, 1.0)),
    ("marionette lines from the mouth corners to the chin", "line", "", (0, .10, .35, .60, .80, .95)),
    ("vertical lines on the upper lip", "line", "smoke", (0, .05, .25, .50, .75, .90)),
    ("horizontal neck lines", "line", "", (.10, .25, .45, .65, .80, .90)),
    ("looser, thinner skin on the neck", "degree", "sun", (0, .05, .20, .45, .70, .90)),
    ("irregular, blotchy sun spots of different sizes on the face and any other visible skin", "count", "pigment",
     (.05, .20, .45, .65, .80, .90)),
    ("raised age spots on the face", "count", "pigment", (0, .05, .20, .40, .60, .80)),
    ("uneven, mottled skin tone", "degree", "pigment", (.15, .30, .45, .60, .70, .80)),
    ("enlarged pores", "count", "", (.20, .40, .50, .60, .65, .70)),
    ("dull, sallow skin tone", "degree", "smoke", (.05, .20, .40, .60, .75, .85)),
    ("softer, sagging jawline", "degree", "shape", (0, .10, .30, .55, .75, .90)),
    ("sagging jowls", "degree", "shape", (0, 0, .15, .45, .70, .90)),
    ("thinner lips", "degree", "shape", (0, .05, .20, .40, .60, .80)),
    ("heavier upper eyelids", "degree", "shape", (0, .10, .30, .50, .70, .85)),
    ("puffy bags under the eyes", "degree", "smoke", (.05, .15, .30, .45, .60, .70)),
    ("hollow temples and cheeks", "degree", "shape", (0, 0, .05, .20, .45, .70)),
)
# Intensity below LEVELS[0] is left out; each further threshold picks the next word.
LEVELS = (0.15, 0.30, 0.45, 0.70, 0.90)
WORDS = {
    "line": ("faint", "light", "visible", "deep", "very deep"),
    "count": ("a few", "some", "scattered", "many", "numerous"),
    "degree": ("very slightly", "slightly", "noticeably", "clearly", "strongly"),
}
SUN_SHIFT = {"low": -5, "average": 0, "heavy": 7}
PIGMENT_SCALE = {"low": 0.7, "average": 1.0, "heavy": 1.3}
SMOKER_SHIFT = 10
# Boogu Image Edit reads the signs about 6 years older than the table (blind-judged tuning round 1), so the signs
# are taken from the table 5 years younger than the target age.
AGE_SHIFT = -5
STRENGTH = {"subtle": 0.75, "natural": 1.0, "strong": 1.25}
HAIR = (
    (75, "white hair along its full length"),
    (65, "mostly gray hair along its full length"),
    (55, "salt-and-pepper hair along its full length"),
    (45, "gray streaks through the hair and at the temples"),
    (35, "a few gray strands in the hair"),
)
EYEBROW_AGE = 65
KEEP = ("Keep the same person: same bone structure, eyes, eye color, nose, skin tone and ethnicity, the same facial "
        "expression and mouth position, the same glasses, jewelry, marks on the skin and facial hair shape, head pose, "
        "framing, clothing, lighting and background. Do not add anything that is not in the photo. Photorealistic, "
        "natural unretouched skin with soft, realistic wrinkles that follow the folds of the skin.")


def parse_ages(text: str) -> list[int]:
    parts = [p for p in re.split(r"[\s,;]+", text.strip()) if p]
    if not parts or not all(p.isdigit() for p in parts):
        raise ValueError(AGES_ERROR)
    ages = list(dict.fromkeys(int(p) for p in parts))
    if not all(MIN_AGE <= a <= MAX_AGE for a in ages):
        raise ValueError(AGES_ERROR)
    if len(ages) > MAX_AGES:
        raise ValueError(f"At most {MAX_AGES} ages at a time.")
    return ages


def level(values: tuple, age: float) -> float:
    """Table value at an age: linear between table ages, falling to 0 at 20, +0.05 per decade after 80."""
    if age <= TABLE_AGES[0]:
        return max(0.0, values[0] * (age - MIN_AGE) / (TABLE_AGES[0] - MIN_AGE))
    if age >= TABLE_AGES[-1]:
        return min(1.0, values[-1] + 0.005 * (age - TABLE_AGES[-1]))
    i = int((age - TABLE_AGES[0]) // 10)
    return values[i] + (values[i + 1] - values[i]) * (age - TABLE_AGES[i]) / 10


def intensity(group: str, values: tuple, age: int, sun: str, smoker: bool, strength: str) -> float:
    shift = SUN_SHIFT[sun] if group in ("sun", "pigment") else SMOKER_SHIFT if group == "smoke" and smoker else 0
    value = level(values, age + AGE_SHIFT + shift)
    if group == "pigment":
        value *= PIGMENT_SCALE[sun]
    return min(1.0, value * STRENGTH[strength])


def hair_phrase(age: int, gray: bool) -> str:
    if not gray:
        return "keep the natural hair color and eyebrow color"
    phrase = next((words for start, words in HAIR if age >= start), "")
    return f"{phrase}, graying eyebrows" if phrase and age >= EYEBROW_AGE else phrase


def sentence(text: str) -> str:
    return text[0].upper() + text[1:] + "."


def recipe(age: int, sun: str, smoker: bool, strength: str, gray: bool) -> tuple[str, float]:
    """Returns the edit instruction for one target age and its texture_amount."""
    signs = []
    for phrase, scale, group, values in FEATURES:
        step = bisect.bisect_right(LEVELS, intensity(group, values, age, sun, smoker, strength)) - 1
        if step >= 0:
            signs.append(f"{WORDS[scale][step]} {phrase}")
    parts = [f"Age this person to look {age} years old."]
    if signs:
        parts.append(sentence(", ".join(signs)))
    if hair := hair_phrase(age, gray):
        parts.append(sentence(hair))
    parts.append(KEEP)
    _, _, group, values = FEATURES[0]
    return " ".join(parts), round(intensity(group, values, age, sun, smoker, strength), 3)


class AgeRecipe(io.ComfyNode):
    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id="MyCustom_AgeRecipe",
            display_name="Age Recipe",
            category="ReTodded",
            description="Turns a list of target ages into one aging instruction per age for an image-edit model, "
                        "naming the wrinkles, spots, sagging and gray hair that belong to each age.",
            inputs=[
                io.String.Input("ages", default="40, 50, 60, 70",
                                tooltip="Target ages from 20 to 100, separated by commas. Each age gets its own picture."),
                io.Combo.Input("sun_damage", options=["low", "average", "heavy"], default="average",
                               tooltip="How much sun the skin has had. Heavy adds sun spots and deeper lines earlier."),
                io.Boolean.Input("smoker", default=False,
                                 tooltip="Adds smoker's aging: lines on the upper lip, eye bags, duller skin."),
                io.Combo.Input("strength", options=["subtle", "natural", "strong"], default="natural",
                               tooltip="Turns the whole look down or up if pictures look too young or too old."),
                io.Boolean.Input("gray_hair", default=True,
                                 tooltip="Off keeps the natural hair and eyebrow color, for example for dyed hair."),
            ],
            outputs=[
                io.String.Output(display_name="prompt", is_output_list=True),
                io.String.Output(display_name="label", is_output_list=True),
                io.Float.Output(display_name="texture_amount", is_output_list=True),
                io.Int.Output(display_name="strip_columns"),
                io.String.Output(display_name="summary"),
            ],
        )

    @classmethod
    @override
    def execute(cls, ages: str, sun_damage: str, smoker: bool, strength: str, gray_hair: bool) -> io.NodeOutput:
        targets = parse_ages(ages)
        recipes = [recipe(age, sun_damage, smoker, strength, gray_hair) for age in targets]
        prompts = [prompt for prompt, _ in recipes]
        summary = "\n\n".join(f"Age {age}: {prompt}" for age, prompt in zip(targets, prompts))
        return io.NodeOutput(prompts, [f"Age {age}" for age in targets], [amount for _, amount in recipes],
                             len(targets) + 1, summary)


NODES = [AgeRecipe]
