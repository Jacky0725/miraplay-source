// Screen explicit risk signals while allowing neutral uses of words such as 学生 or 制服.
// The detail page is checked again before playback because list titles can omit context.
const CLEAR_MINOR = /未成年|未滿(?:十八|18)|未满(?:十八|18)|未到十八|18歳未満|小學生|小学生|初中生|高中生|中學生|中学生|高校生|女子高生|女子校生|幼女|萝莉|蘿莉|正太|兒童色情|儿童色情|underage|child\s*porn|\bminor\b|lolita|ロリ|\b(?:jk|jc|js)\b/i;
const SCHOOL_CONTEXT = /學生|学生|校園|校园|學園|学園|學校|学校|高校|高中|初中|中學|中学|小學|小学|女學生|女学生|女子校|師生|师生|學妹|学妹|學姐|学姐|少女|孩子|小孩|制服|schoolgirl|schoolboy|student|campus|high\s*school|\bchild\b|teen/i;
const FAMILY_CONTEXT = /繼女|继女|繼子|继子|兒子|儿子|女兒|女儿|妹妹|弟弟|いもうと|義妹|義弟|継娘|継息子|母子|父女|母女|父子|親子/i;
const CLEAR_INCEST = /亂倫|乱伦|近親|incest/i;
const CLEAR_ASSAULT = /強姦|强奸|迷奸|rape|nonconsensual/i;
const COERCION_CONTEXT = /強迫|强迫|監禁|监禁|凌辱|催眠/i;
const SEXUAL_CONTEXT = /性交|性爱|性愛|做爱|做愛|性侵|性虐|中出|內射|内射|射精|榨精|種付け|セックス|SEX|口交|フェラ|自慰|高潮|淫|裸|性玩具|调教|調教|操弄|强奸|強姦/i;

function metadataText(values) {
    return values.flat(Infinity).filter((value) => value != null)
        .map((value) => String(value)).join(' ').normalize('NFKC');
}

export function flaggedAdultTerms(...values) {
    const text = metadataText(values);
    if (!text.trim()) return [];
    const flags = [];
    for (const pattern of [CLEAR_MINOR, CLEAR_INCEST, CLEAR_ASSAULT]) {
        const match = text.match(pattern);
        if (match) flags.push(match[0]);
    }
    if (SEXUAL_CONTEXT.test(text)) {
        for (const pattern of [SCHOOL_CONTEXT, FAMILY_CONTEXT, COERCION_CONTEXT]) {
            const match = text.match(pattern);
            if (match) flags.push(match[0]);
        }
    }
    return [...new Set(flags)];
}

export function allowedAdultMetadata(...values) {
    const text = metadataText(values);
    return !!text.trim() && flaggedAdultTerms(...values).length === 0;
}

export function cleanEpisodeTitle(value, fallback) {
    return String(value || fallback).replace(/[$#]/g, ' ').trim();
}
