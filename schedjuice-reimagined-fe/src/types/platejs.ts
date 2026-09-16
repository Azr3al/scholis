
type editorValueChild = {
    id: string;
    type: string;
    children: editorValueChild[] | {
        text: string;
    }[]
}

export type editorValue = editorValueChild[] ;