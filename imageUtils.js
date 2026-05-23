export async function optimizeImage(
    file,
    {
        maxWidth = 1600,
        maxHeight = 1600,
        quality = 0.82,
        outputType = "image/webp",
        maxOriginalMB = 10
    } = {}
) {

    if (!file) return null;

    if (file.size > maxOriginalMB * 1024 * 1024) {
        throw new Error(
            `Image too large. Max ${maxOriginalMB}MB.`
        );
    }

    if (!file.type.startsWith("image/")) {
        throw new Error(
            "Only image uploads allowed."
        );
    }

    const image =
        await loadImage(file);

    let width =
        image.width;

    let height =
        image.height;

    const scale =
        Math.min(
            maxWidth / width,
            maxHeight / height,
            1
        );

    width =
        Math.round(width * scale);

    height =
        Math.round(height * scale);

    const canvas =
        document.createElement(
            "canvas"
        );

    canvas.width =
        width;

    canvas.height =
        height;

    const ctx =
        canvas.getContext(
            "2d"
        );

    ctx.drawImage(
        image,
        0,
        0,
        width,
        height
    );

    const blob =
        await new Promise(
            resolve => {

                canvas.toBlob(
                    resolve,
                    outputType,
                    quality
                );

            }
        );

    return new File(
        [blob],
        file.name
            .replace(/\.\w+$/, "")
        + ".webp",
        {
            type:
                outputType
        }
    );
}

function loadImage(file) {

    return new Promise(
        (
            resolve,
            reject
        ) => {

            const url =
                URL.createObjectURL(
                    file
                );

            const img =
                new Image();

            img.onload =
                () => {

                    URL.revokeObjectURL(
                        url
                    );

                    resolve(
                        img
                    );

                };

            img.onerror =
                reject;

            img.src =
                url;

        }
    );

}// JavaScript source code
