
export const getDimensions = (imageSrc: string, callback: (width: number, height: number) => void) => {
    const img = new Image();
    img.onload = () => {
        callback(img.width, img.height);
    };
    img.src = imageSrc;

    
}