
export const roundNumber = (num: number) => {
    return Math.round((num + Number.EPSILON) * 100) / 100
}

export const getOrdinalSuffix = (num: number) => {
    const suffixes = ["th", "st", "nd", "rd"];
    const remainder = num % 100;
    return num + (suffixes[(remainder - 20) % 10] || suffixes[remainder] || suffixes[0]);
}