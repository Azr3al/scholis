
export type queryParamOptions = {
    page?: number,
    size?: number,
    sorts?: string[],
    expand?: string[],
    fields?: string[],
    csv?: boolean,
    group_by?: "latest"| "best" | "all"
    range?: string
    range_group_by?: "day" | "month"
    onlyFree?: boolean
    q?: string
    /** When set and the role has collision disabled, available-users skips busy filtering. */
    assigned_as_role_id?: number
    all?: boolean
    /** When true, POST /users/search includes inactive users (non-student lists). */
    include_inactive?: boolean
    /** When true, POST /user-courses/search applies teacher roster seniority order (course members staff). */
    teacher_roster_order?: boolean
    /** When true, POST /user-courses/search orders enrolled students by user name (course members students). */
    student_roster_order?: boolean
}

export enum operatorEnum {
    exact = "exact",
    iexact = "iexact",
    in = "in",
    lt = "lt",
    gt = "gt",
    lte = "lte",
    gte = "gte",
    icontains = "icontains",
    contains = "contains",
    contained_by = "contained_by",
    overlap = "overlap",
    isnull= "isnull"

}

export type filterParam = {
    field_name: string,
    operator: operatorEnum,
    value: string 
}

export type filterParamsBody = {
    filter_params?: filterParam[],
    exclude_params?: filterParam[]
    facets?: ("status" | "subject" | "category")[]
}

