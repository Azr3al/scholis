
import * as z from "zod"
import { accountType } from "./user";


type newsContentType = {
    title: string;
    subText: string;
    paragraphs: string[];
    imageCode: string;
}
export type newsType = {
    title: string;
    data: {
        headline: newsContentType
        contents: newsContentType[]
    }
    createdBy: accountType;
}