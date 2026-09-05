
export type AiDetectorResponse = {
    isError: boolean;
    message: string;
    data: {
     
        version: string;
        scanId: string;
        documents: {
            predicted_class: "human" | "ai" | "mixed";
            confidence_score: number;
            result_message: string;
        }[]
    }
}