[CmdletBinding()]
param(
    [string]$PackageRoot = "\\oz\PUBLIC_2024\Asset_Unity_3D\Assets",
    [string]$PluginRoot = "\\oz\DEV\3. UNITY PLUGIN",
    [string]$OutputPath = "",
    [string[]]$Exclude = @("Web Preview Package", "__MACOSX"),
    [string[]]$ArchiveExtensions = @(".zip", ".rar", ".7z", ".tar", ".gz", ".bz2", ".xz", ".unitypackage"),
    [int]$MaxResultsPerQuery = 10,
    [int]$QueryLimitPerItem = 6,
    [int]$AssetStoreQueryLimitPerItem = 2
)

$ErrorActionPreference = "Stop"

$StopWords = @(
    "a", "an", "and", "the",
    "low", "poly", "3d", "models", "model", "pack", "asset", "assets",
    "free", "download", "by", "version", "ver", "lts", "urp"
)

$script:SearchCache = @{}
$script:AssetStoreSearchCache = @{}
$script:AssetStoreSearchToken = ""
$script:AssetStoreRequestTemplate = $null
$script:JsonSerializer = $null

try {
    Add-Type -AssemblyName System.Web.Extensions -ErrorAction Stop
}
catch {
    throw "Cannot load System.Web.Extensions for JSON parsing: $($_.Exception.Message)"
}

$script:JsonSerializer = New-Object System.Web.Script.Serialization.JavaScriptSerializer
$script:JsonSerializer.MaxJsonLength = [int]::MaxValue

function Normalize-Text {
    param([string]$Text)

    if ([string]::IsNullOrWhiteSpace($Text)) {
        return ""
    }

    $value = $Text.ToLowerInvariant()
    $value = $value -replace "&\#8211;|&ndash;|&mdash;", " "
    $value = $value -replace "[^a-z0-9]+", " "
    $value = $value -replace "\s+", " "
    return $value.Trim()
}

function Remove-VersionNoise {
    param([string]$Text)

    if ([string]::IsNullOrWhiteSpace($Text)) {
        return ""
    }

    $value = $Text
    $value = $value -replace "\((\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4})\)", " "
    $value = $value -replace "\((URP|HDRP|Built[- ]?in|latest)[^)]*\)", " "
    $value = $value -replace "\bv[0-9xX]+(?:\.[0-9xX]+)*\b", " "
    $value = $value -replace "\bLTS\b", " "
    $value = $value -replace "\s+", " "
    return $value.Trim()
}

function Get-MeaningfulTokens {
    param(
        [string]$Text,
        [switch]$KeepNumbers
    )

    $normalized = Normalize-Text -Text $Text
    if ([string]::IsNullOrWhiteSpace($normalized)) {
        return @()
    }

    $tokens = New-Object System.Collections.Generic.List[string]
    foreach ($token in $normalized.Split(" ")) {
        if ([string]::IsNullOrWhiteSpace($token)) {
            continue
        }

        $word = $token
        if ($word -eq "platformers") {
            $word = "platformer"
        }

        if ($word -match "^\d+$") {
            if (-not $KeepNumbers) {
                continue
            }
            if (-not $tokens.Contains($word)) {
                $tokens.Add($word)
            }
            continue
        }

        if ($word.Length -le 1) {
            continue
        }

        if ($StopWords -contains $word) {
            continue
        }

        if (-not $tokens.Contains($word)) {
            $tokens.Add($word)
        }
    }

    return $tokens.ToArray()
}

function Read-TextFileSafely {
    param([string]$Path)

    try {
        return [System.IO.File]::ReadAllText($Path)
    }
    catch {
        return ""
    }
}

function Get-OriginalPackageUrl {
    param([string]$FolderPath)

    $textFiles = Get-ChildItem -LiteralPath $FolderPath -File -Recurse -ErrorAction SilentlyContinue |
        Where-Object { $_.Extension -in @(".txt", ".md") } |
        Select-Object -First 30

    foreach ($file in $textFiles) {
        $content = Read-TextFileSafely -Path $file.FullName
        if ([string]::IsNullOrWhiteSpace($content)) {
            continue
        }

        $match = [regex]::Match($content, "https?://assetstore\.unity\.com/packages/[^\s`"']+")
        if ($match.Success) {
            return $match.Value.Trim()
        }
    }

    return $null
}

function Get-HintTokensFromAssetStoreUrl {
    param([string]$AssetStoreUrl)

    if ([string]::IsNullOrWhiteSpace($AssetStoreUrl)) {
        return @()
    }

    try {
        $uri = [System.Uri]$AssetStoreUrl
    }
    catch {
        return @()
    }

    $segments = $uri.AbsolutePath.Trim("/") -split "/"
    if ($segments.Count -eq 0) {
        return @()
    }

    $lastSegment = $segments[$segments.Count - 1]
    $slug = $lastSegment -replace "-\d+$", ""
    return Get-MeaningfulTokens -Text $slug -KeepNumbers
}

function Search-UnityAssetCollection {
    param(
        [string]$Query,
        [int]$MaxResults
    )

    if ([string]::IsNullOrWhiteSpace($Query)) {
        return @()
    }

    $normalizedQuery = $Query.Trim().ToLowerInvariant()

    if (-not $script:SearchCache.ContainsKey($normalizedQuery)) {
        $searchUrl = "https://unityassetcollection.com/?s=$([uri]::EscapeDataString($Query))"
        $parsed = New-Object System.Collections.Generic.List[object]

        try {
            $html = (Invoke-WebRequest -Uri $searchUrl -UseBasicParsing -TimeoutSec 30).Content
            
            $articlePattern = "(?s)<article class=`"latestPost excerpt\s*[^`"]*`">(.*?)</article>"
            $articles = [regex]::Matches($html, $articlePattern)

            foreach ($article in $articles) {
                $articleHtml = $article.Groups[1].Value
                
                $titleMatch = [regex]::Match($articleHtml, "<h2 class=`"title front-view-title`"><a href=`"([^`"]+)`"[^>]*>(.*?)</a></h2>")
                if (-not $titleMatch.Success) {
                    continue
                }

                $url = $titleMatch.Groups[1].Value.Trim()
                if ([string]::IsNullOrWhiteSpace($url) -or -not $url.StartsWith("https://unityassetcollection.com/")) {
                    continue
                }

                $rawTitle = $titleMatch.Groups[2].Value
                $titleNoTags = $rawTitle -replace "<[^>]+>", ""
                $decodedTitle = [System.Net.WebUtility]::HtmlDecode($titleNoTags)
                $title = ($decodedTitle -replace "\s+", " ").Trim()
                $title = [regex]::Replace($title, "[^\u0000-\u007F]+", " ")
                $title = ($title -replace "\s+", " ").Trim()

                $thumbnail = ""
                $imgMatch = [regex]::Match($articleHtml, "(?s)<div class=`"featured-thumbnail\s*[^`"]*`"><img\s+([^>]*?)>")
                if ($imgMatch.Success) {
                    $imgAttributes = $imgMatch.Groups[1].Value
                    
                    $urlMatch = [regex]::Match($imgAttributes, "data-lazy-src=`"([^`"]+)`"")
                    if (-not $urlMatch.Success) {
                        $urlMatch = [regex]::Match($imgAttributes, "data-src=`"([^`"]+)`"")
                    }
                    if (-not $urlMatch.Success) {
                        $urlMatch = [regex]::Match($imgAttributes, "src=`"([^`"]+)`"")
                    }
                    
                    if ($urlMatch.Success) {
                        $tempUrl = $urlMatch.Groups[1].Value.Trim()
                        if ($tempUrl -match "^https?://") {
                            $thumbnail = $tempUrl
                        }
                    }
                }

                $parsed.Add([pscustomobject]@{
                        title     = $title
                        url       = $url
                        thumbnail = $thumbnail
                    })
            }
        }
        catch {
            Write-Warning "Search failed for query '$Query': $($_.Exception.Message)"
        }

        $script:SearchCache[$normalizedQuery] = $parsed.ToArray()
    }

    $cachedResults = @($script:SearchCache[$normalizedQuery] | Select-Object -First $MaxResults)
    $results = New-Object System.Collections.Generic.List[object]
    foreach ($item in $cachedResults) {
        $results.Add([pscustomobject]@{
                title     = $item.title
                url       = $item.url
                query     = $Query
                thumbnail = $item.thumbnail
            })
    }

    return $results.ToArray()
}

function Build-UnityCollectionSearchUrl {
    param([string]$Query)

    return "https://unityassetcollection.com/?s=$([uri]::EscapeDataString($Query))"
}

function Build-UnityAssetStoreSearchUrl {
    param([string]$Query)

    return "https://assetstore.unity.com/search?q=$([uri]::EscapeDataString($Query))"
}

function ConvertFrom-JsonLoose {
    param([string]$JsonText)

    if ([string]::IsNullOrWhiteSpace($JsonText)) {
        return $null
    }

    try {
        return $script:JsonSerializer.DeserializeObject($JsonText)
    }
    catch {
        Write-Warning "Loose JSON parse failed: $($_.Exception.Message)"
        return $null
    }
}

function Get-FirstValueAsString {
    param($Value)

    if ($null -eq $Value) {
        return ""
    }

    if ($Value -is [System.Array]) {
        if ($Value.Length -eq 0) {
            return ""
        }
        return [string]$Value[0]
    }

    return [string]$Value
}

function Convert-HtmlToPlainText {
    param(
        [string]$Text,
        [int]$MaxLength = 340
    )

    if ([string]::IsNullOrWhiteSpace($Text)) {
        return ""
    }

    $value = [System.Net.WebUtility]::HtmlDecode($Text)
    $value = $value -replace "<[^>]+>", " "
    $value = $value -replace "\s+", " "
    $value = $value.Trim()

    if ($value.Length -gt $MaxLength) {
        return ($value.Substring(0, $MaxLength - 1).Trim() + "...")
    }

    return $value
}

function Get-FirstHttpUrl {
    param($Value)

    if ($null -eq $Value) {
        return ""
    }

    if ($Value -is [System.Array]) {
        foreach ($entry in $Value) {
            $candidate = [string]$entry
            if ($candidate -match "^https?://") {
                return $candidate
            }
        }
        return ""
    }

    $single = [string]$Value
    if ($single -match "^https?://") {
        return $single
    }

    return ""
}

function Normalize-AssetStorePackageUrl {
    param([string]$Url)

    if ([string]::IsNullOrWhiteSpace($Url)) {
        return ""
    }

    try {
        $uri = [System.Uri]$Url
    }
    catch {
        return ""
    }

    if ($uri.Host -notlike "*assetstore.unity.com") {
        return ""
    }

    if (-not $uri.AbsolutePath.StartsWith("/packages/")) {
        return ""
    }

    $cleanPath = $uri.AbsolutePath.TrimEnd("/")
    return "https://assetstore.unity.com$cleanPath"
}

function Get-AssetStoreSearchToken {
    if (-not [string]::IsNullOrWhiteSpace($script:AssetStoreSearchToken)) {
        return $script:AssetStoreSearchToken
    }

    try {
        $token = Invoke-RestMethod -Method Get -Uri "https://assetstore.unity.com/api/coveo/search-token?searchHub=Assetstore_Search" -Headers @{
            "User-Agent" = "Mozilla/5.0"
            "Accept"     = "application/json"
        } -TimeoutSec 30

        $tokenText = [string]$token
        if (-not [string]::IsNullOrWhiteSpace($tokenText)) {
            $script:AssetStoreSearchToken = $tokenText
            return $script:AssetStoreSearchToken
        }
    }
    catch {
        Write-Warning "Cannot get Asset Store token: $($_.Exception.Message)"
    }

    return ""
}

function New-AssetStoreSearchRequestBody {
    param([string]$Query)

    $visitorId = [guid]::NewGuid().ToString()
    $now = [DateTime]::UtcNow.ToString("yyyy-MM-ddTHH:mm:ss.fffZ")

    $requestObj = [ordered]@{
        locale                 = "en-US"
        debug                  = $false
        tab                    = "default"
        referrer               = "default"
        timezone               = "Asia/Bangkok"
        visitorId              = $visitorId
        actionsHistory         = @(
            @{
                name  = "Query"
                time  = "`"$now`""
                value = $Query
            }
        )
        context                = @{
            website       = "assetstore"
            language      = "en-US"
            engineUniqueId = "Assetstore_Search"
            userGroups    = @("assetStoreUsers")
        }
        fieldsToInclude        = @(
            "author", "language", "urihash", "objecttype", "collection", "source", "permanentid", "date", "filetype", "parents",
            "ec_price", "ec_name", "ec_description", "ec_brand", "ec_category", "ec_item_group_id", "ec_shortdesc", "ec_thumbnails",
            "ec_images", "ec_promo_price", "ec_in_stock", "ec_rating", "ec_sale", "ec_price_filter", "ec_rating_count",
            "publisher_name", "publisher_id", "ec_product_id", "ec_tags", "min_unity_version", "ec_flash_teaser_starts_at", "ec_flash_promo_starts_at"
        )
        dictionaryFieldContext = @{
            ec_price        = "USD"
            ec_price_filter = "USD"
        }
        q                      = $Query
        enableQuerySyntax      = $false
        searchHub              = "Assetstore_Search"
        sortCriteria           = "relevancy"
        analytics              = @{
            clientId        = $visitorId
            clientTimestamp = $now
            documentReferrer = "default"
            originContext   = "Search"
            actionCause     = "interfaceLoad"
            customData      = @{
                context_website       = "assetstore"
                context_language      = "en-US"
                context_engineUniqueId = "Assetstore_Search"
                context_userGroups    = @("assetStoreUsers")
                coveoHeadlessVersion  = "2.39.0"
            }
            capture         = $false
        }
        enableDidYouMean       = $true
        facets                 = @(
            @{
                filterFacetCount  = $true
                injectionDepth    = 1000
                numberOfValues    = 10
                sortCriteria      = "automatic"
                resultsMustMatch  = "atLeastOneValue"
                type              = "specific"
                currentValues     = @()
                freezeCurrentValues = $false
                isFieldExpanded   = $false
                preventAutoSelect = $false
                facetId           = "ec_sale_filters"
                field             = "ec_sale_filters"
            },
            @{
                filterFacetCount  = $true
                injectionDepth    = 1000
                numberOfValues    = 8
                sortCriteria      = "automatic"
                resultsMustMatch  = "atLeastOneValue"
                type              = "specific"
                currentValues     = @()
                freezeCurrentValues = $false
                isFieldExpanded   = $false
                preventAutoSelect = $false
                facetId           = "publisher_name"
                field             = "publisher_name"
            },
            @{
                filterFacetCount  = $true
                injectionDepth    = 1000
                numberOfValues    = 6
                sortCriteria      = "ascending"
                rangeAlgorithm    = "equiprobable"
                resultsMustMatch  = "atLeastOneValue"
                currentValues     = @(
                    @{ endInclusive = $true; state = "idle"; start = 0; end = 0; label = "Free" },
                    @{ endInclusive = $false; state = "idle"; start = 0.01; end = 20; label = "Below $20.00" },
                    @{ endInclusive = $false; state = "idle"; start = 20; end = 50 },
                    @{ endInclusive = $false; state = "idle"; start = 50; end = 100 },
                    @{ endInclusive = $false; state = "idle"; start = 100; end = 200 },
                    @{ endInclusive = $false; state = "idle"; start = 200; end = 200; label = "Over $200.00" }
                )
                preventAutoSelect = $false
                type              = "numericalRange"
                facetId           = "ec_price_filter"
                field             = "ec_price_filter"
                generateAutomaticRanges = $false
            },
            @{
                filterFacetCount  = $true
                injectionDepth    = 1000
                numberOfValues    = 5
                sortCriteria      = "descending"
                rangeAlgorithm    = "equiprobable"
                resultsMustMatch  = "atLeastOneValue"
                currentValues     = @(
                    @{ endInclusive = $true; state = "idle"; start = 1; end = 5; label = "1 star" },
                    @{ endInclusive = $true; state = "idle"; start = 2; end = 5; label = "2 stars" },
                    @{ endInclusive = $true; state = "idle"; start = 3; end = 5; label = "3 stars" },
                    @{ endInclusive = $true; state = "idle"; start = 4; end = 5; label = "4 stars" },
                    @{ endInclusive = $true; state = "idle"; start = 4.75; end = 5; label = "5 stars" }
                )
                preventAutoSelect = $false
                type              = "numericalRange"
                facetId           = "ec_rating"
                field             = "ec_rating"
                generateAutomaticRanges = $false
            },
            @{
                filterFacetCount  = $true
                injectionDepth    = 1000
                numberOfValues    = 8
                sortCriteria      = "descending"
                rangeAlgorithm    = "equiprobable"
                resultsMustMatch  = "atLeastOneValue"
                currentValues     = @(
                    @{ endInclusive = $false; state = "idle"; start = 0; end = 600099; label = "6000.x" },
                    @{ endInclusive = $false; state = "idle"; start = 0; end = 202299; label = "2022.x" },
                    @{ endInclusive = $false; state = "idle"; start = 0; end = 202199; label = "2021.x" },
                    @{ endInclusive = $false; state = "idle"; start = 0; end = 202099; label = "2020.x" },
                    @{ endInclusive = $false; state = "idle"; start = 0; end = 201999; label = "2019.x" },
                    @{ endInclusive = $false; state = "idle"; start = 0; end = 201899; label = "2018.x" },
                    @{ endInclusive = $false; state = "idle"; start = 0; end = 201799; label = "2017.x" },
                    @{ endInclusive = $false; state = "idle"; start = 0; end = 599; label = "5.x" }
                )
                preventAutoSelect = $false
                type              = "numericalRange"
                facetId           = "min_unity_version"
                field             = "min_unity_version"
                generateAutomaticRanges = $false
            },
            @{
                filterFacetCount  = $true
                injectionDepth    = 1000
                numberOfValues    = 5
                sortCriteria      = "descending"
                rangeAlgorithm    = "even"
                resultsMustMatch  = "atLeastOneValue"
                currentValues     = @(
                    @{ start = "2026/04/20@17:23:22"; end = "2026/04/21@17:23:22"; endInclusive = $false; state = "idle" },
                    @{ start = "2026/04/14@17:23:22"; end = "2026/04/21@17:23:22"; endInclusive = $false; state = "idle" },
                    @{ start = "2026/03/21@17:23:22"; end = "2026/04/21@17:23:22"; endInclusive = $false; state = "idle" },
                    @{ start = "2025/10/23@17:23:22"; end = "2026/04/21@17:23:22"; endInclusive = $false; state = "idle" },
                    @{ start = "2025/04/21@17:23:22"; end = "2026/04/21@17:23:22"; endInclusive = $false; state = "idle" }
                )
                preventAutoSelect = $false
                type              = "dateRange"
                facetId           = "first_published_at"
                field             = "first_published_at"
                generateAutomaticRanges = $false
            },
            @{
                delimitingCharacter = ","
                filterFacetCount    = $false
                injectionDepth      = 1000
                numberOfValues      = 150
                sortCriteria        = "occurrences"
                basePath            = @()
                filterByBasePath    = $true
                resultsMustMatch    = "atLeastOneValue"
                currentValues       = @()
                preventAutoSelect   = $false
                type                = "hierarchical"
                field               = "ec_category"
                facetId             = "ec_category"
            }
        )
        numberOfResults        = 96
        firstResult            = 0
        facetOptions           = @{
            freezeFacetOrder = $false
        }
    }

    return ($requestObj | ConvertTo-Json -Depth 30)
}

function Search-UnityAssetStore {
    param(
        [string]$Query,
        [int]$MaxResults
    )

    if ([string]::IsNullOrWhiteSpace($Query)) {
        return @()
    }

    $normalizedQuery = $Query.Trim().ToLowerInvariant()
    if ($script:AssetStoreSearchCache.ContainsKey($normalizedQuery)) {
        return @($script:AssetStoreSearchCache[$normalizedQuery] | Select-Object -First $MaxResults)
    }

    $token = Get-AssetStoreSearchToken
    if ([string]::IsNullOrWhiteSpace($token)) {
        $script:AssetStoreSearchCache[$normalizedQuery] = @()
        return @()
    }

    $parsed = New-Object System.Collections.Generic.List[object]
    $requestJson = New-AssetStoreSearchRequestBody -Query $Query
    $requestBytes = [System.Text.Encoding]::UTF8.GetBytes($requestJson)

    try {
        $response = Invoke-WebRequest -Method Post -Uri "https://unitytechnologiesproductionmkahteav.org.coveo.com/rest/search/v2?organizationId=unitytechnologiesproductionmkahteav" -Headers @{
            "Authorization" = "Bearer $token"
            "Content-Type"  = "application/json; charset=utf-8"
            "Origin"        = "https://assetstore.unity.com"
            "Referer"       = "https://assetstore.unity.com/"
            "User-Agent"    = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36"
            "Accept"        = "*/*"
        } -Body $requestBytes -UseBasicParsing -TimeoutSec 35

        $responseObj = ConvertFrom-JsonLoose -JsonText $response.Content
        if ($responseObj -is [System.Collections.IDictionary] -and $responseObj.ContainsKey("results")) {
            $resultRows = $responseObj["results"]
            if ($resultRows -is [System.Array]) {
                foreach ($row in $resultRows) {
                    if ($row -isnot [System.Collections.IDictionary]) {
                        continue
                    }

                    $raw = if ($row.ContainsKey("raw")) { $row["raw"] } else { $null }
                    $title = ""
                    if ($raw -is [System.Collections.IDictionary] -and $raw.ContainsKey("ec_name")) {
                        $title = Get-FirstValueAsString -Value $raw["ec_name"]
                    }
                    if ([string]::IsNullOrWhiteSpace($title) -and $row.ContainsKey("title")) {
                        $title = Get-FirstValueAsString -Value $row["title"]
                    }

                    $url = if ($row.ContainsKey("clickUri")) { [string]$row["clickUri"] } else { "" }
                    $productId = ""
                    if ($raw -is [System.Collections.IDictionary] -and $raw.ContainsKey("ec_product_id")) {
                        $productId = Get-FirstValueAsString -Value $raw["ec_product_id"]
                    }
                    if ([string]::IsNullOrWhiteSpace($url) -and -not [string]::IsNullOrWhiteSpace($productId)) {
                        $url = "https://assetstore.unity.com/packages/package/$productId"
                    }

                    if ([string]::IsNullOrWhiteSpace($url)) {
                        continue
                    }
                    if (-not $url.StartsWith("https://assetstore.unity.com/")) {
                        continue
                    }

                    $description = ""
                    $shortDescription = ""
                    $thumbnail = ""
                    $publisher = ""
                    $price = ""
                    $promoPrice = ""
                    $rating = ""
                    $ratingCount = ""
                    $category = ""
                    $minUnityVersion = ""

                    if ($raw -is [System.Collections.IDictionary]) {
                        if ($raw.ContainsKey("ec_description")) {
                            $description = Convert-HtmlToPlainText -Text (Get-FirstValueAsString -Value $raw["ec_description"]) -MaxLength 380
                        }
                        if ($raw.ContainsKey("ec_shortdesc")) {
                            $shortDescription = Convert-HtmlToPlainText -Text (Get-FirstValueAsString -Value $raw["ec_shortdesc"]) -MaxLength 220
                        }
                        if ($raw.ContainsKey("ec_thumbnails")) {
                            $thumbnail = Get-FirstHttpUrl -Value $raw["ec_thumbnails"]
                        }
                        if ($raw.ContainsKey("publisher_name")) {
                            $publisher = Get-FirstValueAsString -Value $raw["publisher_name"]
                        }
                        if ($raw.ContainsKey("ec_price")) {
                            $price = Get-FirstValueAsString -Value $raw["ec_price"]
                        }
                        if ($raw.ContainsKey("ec_promo_price")) {
                            $promoPrice = Get-FirstValueAsString -Value $raw["ec_promo_price"]
                        }
                        if ($raw.ContainsKey("ec_rating")) {
                            $rating = Get-FirstValueAsString -Value $raw["ec_rating"]
                        }
                        if ($raw.ContainsKey("ec_rating_count")) {
                            $ratingCount = Get-FirstValueAsString -Value $raw["ec_rating_count"]
                        }
                        if ($raw.ContainsKey("ec_category")) {
                            $category = Get-FirstValueAsString -Value $raw["ec_category"]
                        }
                        if ($raw.ContainsKey("min_unity_version")) {
                            $minUnityVersion = Get-FirstValueAsString -Value $raw["min_unity_version"]
                        }
                    }

                    $parsed.Add([pscustomobject]@{
                            title     = $title
                            url       = $url
                            query     = $Query
                            productId = $productId
                            description = $description
                            shortDescription = $shortDescription
                            thumbnail = $thumbnail
                            publisher = $publisher
                            price = $price
                            promoPrice = $promoPrice
                            rating = $rating
                            ratingCount = $ratingCount
                            category = $category
                            minUnityVersion = $minUnityVersion
                        })
                }
            }
        }
    }
    catch {
        Write-Warning "Asset Store search failed for query '$Query': $($_.Exception.Message)"
    }

    $script:AssetStoreSearchCache[$normalizedQuery] = $parsed.ToArray()
    return @($script:AssetStoreSearchCache[$normalizedQuery] | Select-Object -First $MaxResults)
}

function Get-ConfidenceFromScore {
    param(
        [bool]$HasMatch,
        [double]$Score
    )

    if (-not $HasMatch) {
        return "none"
    }

    if ($Score -ge 72) {
        return "high"
    }
    if ($Score -ge 45) {
        return "medium"
    }
    return "low"
}

function Score-Candidate {
    param(
        [pscustomobject]$Candidate,
        [string[]]$CoreTokens,
        [string[]]$HintTokens,
        [string[]]$RequiredNumbers
    )

    $score = 0.0
    $candidateText = "$($Candidate.title) $($Candidate.url)"
    $candidateTokens = Get-MeaningfulTokens -Text $candidateText -KeepNumbers
    $tokenSet = [System.Collections.Generic.HashSet[string]]::new([string[]]$candidateTokens)

    foreach ($token in $CoreTokens) {
        if ($tokenSet.Contains($token)) {
            $score += 8
        }
        else {
            $score -= 2
        }
    }

    foreach ($token in $HintTokens) {
        if ($tokenSet.Contains($token)) {
            $score += 5
        }
    }

    if ($RequiredNumbers.Count -gt 0) {
        foreach ($num in $RequiredNumbers) {
            if ($tokenSet.Contains($num)) {
                $score += 12
            }
            else {
                $score -= 8
            }
        }

        $candidateNumbers = $candidateTokens | Where-Object { $_ -match "^\d+$" } | Select-Object -Unique
        foreach ($num in $candidateNumbers) {
            if ($RequiredNumbers -notcontains $num) {
                $score -= 5
            }
        }
    }

    $matchedCore = 0
    foreach ($token in $CoreTokens) {
        if ($tokenSet.Contains($token)) {
            $matchedCore++
        }
    }

    if ($CoreTokens.Count -gt 0) {
        $score += [math]::Round((30 * $matchedCore / [double]$CoreTokens.Count), 2)
    }

    return [math]::Round($score, 2)
}

function Resolve-OutputPath {
    param([string]$Path)

    if ([System.IO.Path]::IsPathRooted($Path)) {
        return [System.IO.Path]::GetFullPath($Path)
    }

    return [System.IO.Path]::GetFullPath((Join-Path (Get-Location) $Path))
}

function New-ArchiveExtensionSet {
    param([string[]]$Extensions)

    $set = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
    foreach ($ext in $Extensions) {
        if ([string]::IsNullOrWhiteSpace($ext)) {
            continue
        }
        $normalizedExt = $ext.Trim().ToLowerInvariant()
        if (-not $normalizedExt.StartsWith(".")) {
            $normalizedExt = "." + $normalizedExt
        }
        $set.Add($normalizedExt) | Out-Null
    }

    return $set
}

function Get-RootSources {
    param(
        [string]$RootPath,
        [string[]]$ExcludeNames,
        [System.Collections.Generic.HashSet[string]]$ArchiveExtensionSet
    )

    $folderSources = @(
        Get-ChildItem -LiteralPath $RootPath -Directory |
            Where-Object { $ExcludeNames -notcontains $_.Name } |
            ForEach-Object {
                [pscustomobject]@{
                    baseName   = $_.Name
                    sourceName = $_.Name
                    fullPath   = $_.FullName
                    sourceType = "folder"
                    extension  = ""
                }
            }
    )

    $archiveSources = @(
        Get-ChildItem -LiteralPath $RootPath -File |
            Where-Object { $ArchiveExtensionSet.Contains($_.Extension.ToLowerInvariant()) } |
            ForEach-Object {
                [pscustomobject]@{
                    baseName   = [System.IO.Path]::GetFileNameWithoutExtension($_.Name)
                    sourceName = $_.Name
                    fullPath   = $_.FullName
                    sourceType = "archive"
                    extension  = $_.Extension.ToLowerInvariant()
                }
            }
    )

    return @($folderSources + $archiveSources)
}

function Build-QueryList {
    param(
        [string[]]$AllBaseNames,
        [string]$DisplayName,
        [string[]]$CoreTokens,
        [string[]]$HintTokens,
        [int]$Limit
    )

    $queries = New-Object System.Collections.Generic.List[string]

    foreach ($q in @(
            $AllBaseNames
            ($AllBaseNames | ForEach-Object { Remove-VersionNoise -Text $_ })
            $DisplayName
            ($CoreTokens -join " ")
            ($HintTokens -join " ")
        )) {
        if ($q -is [System.Array]) {
            foreach ($sub in $q) {
                if ([string]::IsNullOrWhiteSpace($sub)) {
                    continue
                }
                if (-not $queries.Contains($sub)) {
                    $queries.Add($sub)
                }
            }
            continue
        }

        if ([string]::IsNullOrWhiteSpace($q)) {
            continue
        }
        if (-not $queries.Contains($q)) {
            $queries.Add($q)
        }
    }

    if ($queries.Count -gt $Limit) {
        return @($queries | Select-Object -First $Limit)
    }

    return @($queries)
}

function Build-LibraryData {
    param(
        [string]$LibraryId,
        [string]$Label,
        [string]$RootPath,
        [string[]]$ExcludeNames,
        [System.Collections.Generic.HashSet[string]]$ArchiveExtensionSet,
        [int]$MaxResultsPerQuery,
        [int]$QueryLimitPerItem,
        [int]$AssetStoreQueryLimitPerItem
    )

    if (-not (Test-Path -LiteralPath $RootPath)) {
        Write-Warning "Root not found for library '$Label': $RootPath"
        return [pscustomobject]@{
            id             = $LibraryId
            label          = $Label
            root           = $RootPath
            totalPackages  = 0
            totalEntries   = 0
            totalFolders   = 0
            totalArchives  = 0
            packages       = @()
            status         = "missing_root"
        }
    }

    $allSources = @(
        Get-RootSources -RootPath $RootPath -ExcludeNames $ExcludeNames -ArchiveExtensionSet $ArchiveExtensionSet
    )

    if ($allSources.Count -eq 0) {
        return [pscustomobject]@{
            id             = $LibraryId
            label          = $Label
            root           = $RootPath
            totalPackages  = 0
            totalEntries   = 0
            totalFolders   = 0
            totalArchives  = 0
            packages       = @()
            status         = "no_sources"
        }
    }

    $scanGroups = @(
        $allSources |
        Group-Object -Property {
            $cleaned = Remove-VersionNoise -Text $_.baseName
            $key = Normalize-Text -Text $cleaned
            if ([string]::IsNullOrWhiteSpace($key)) {
                $key = Normalize-Text -Text $_.baseName
            }
            $key
        } |
        Where-Object { -not [string]::IsNullOrWhiteSpace($_.Name) } |
        Sort-Object -Property Name
    )

    $packageRows = New-Object System.Collections.Generic.List[object]

    foreach ($group in $scanGroups) {
        $sources = @($group.Group | Sort-Object -Property sourceType, baseName, sourceName)
        $folderSource = $sources | Where-Object { $_.sourceType -eq "folder" } | Select-Object -First 1
        $archiveCount = @($sources | Where-Object { $_.sourceType -eq "archive" }).Count
        $folderCount = @($sources | Where-Object { $_.sourceType -eq "folder" }).Count
        $primarySource = if ($null -ne $folderSource) { $folderSource } else { $sources | Select-Object -First 1 }

        $rawName = if ($null -ne $primarySource) { $primarySource.baseName } else { $group.Name }
        $displayName = Remove-VersionNoise -Text $rawName
        if ([string]::IsNullOrWhiteSpace($displayName)) {
            $displayName = $rawName
        }
        $allBaseNames = @($sources | Select-Object -ExpandProperty baseName -Unique)

        Write-Host "[$Label] Resolving: $rawName [$($sources.Count) source(s)]"

        $coreTokens = Get-MeaningfulTokens -Text $displayName -KeepNumbers
        if ($coreTokens.Count -eq 0) {
            $coreTokens = Get-MeaningfulTokens -Text $rawName -KeepNumbers
        }

        $originalPackageUrl = if ($null -ne $folderSource) { Get-OriginalPackageUrl -FolderPath $folderSource.fullPath } else { $null }
        $hintTokens = Get-HintTokensFromAssetStoreUrl -AssetStoreUrl $originalPackageUrl

        $requiredNumbers = @(
            @($coreTokens + $hintTokens) |
            Where-Object { $_ -match "^\d+$" } |
            Select-Object -Unique
        )

        $queries = Build-QueryList -AllBaseNames $allBaseNames -DisplayName $displayName -CoreTokens $coreTokens -HintTokens $hintTokens -Limit $QueryLimitPerItem

        $unityCandidateByUrl = @{}
        foreach ($query in $queries) {
            $candidates = Search-UnityAssetCollection -Query $query -MaxResults $MaxResultsPerQuery
            foreach ($candidate in $candidates) {
                $score = Score-Candidate -Candidate $candidate -CoreTokens $coreTokens -HintTokens $hintTokens -RequiredNumbers $requiredNumbers
                $row = [pscustomobject]@{
                    title     = $candidate.title
                    url       = $candidate.url
                    query     = $candidate.query
                    score     = $score
                    source    = "unityassetcollection"
                    thumbnail = $candidate.thumbnail
                }

                if ($unityCandidateByUrl.ContainsKey($candidate.url)) {
                    if ($row.score -gt $unityCandidateByUrl[$candidate.url].score) {
                        $unityCandidateByUrl[$candidate.url] = $row
                    }
                }
                else {
                    $unityCandidateByUrl[$candidate.url] = $row
                }
            }
        }

        $assetStoreCandidateByUrl = @{}
        $normalizedOriginalAssetStoreUrl = Normalize-AssetStorePackageUrl -Url $originalPackageUrl
        if (-not [string]::IsNullOrWhiteSpace($normalizedOriginalAssetStoreUrl)) {
            $assetStoreCandidateByUrl[$normalizedOriginalAssetStoreUrl] = [pscustomobject]@{
                title = $displayName
                url   = $normalizedOriginalAssetStoreUrl
                query = "original_package_url"
                score = 140
                source = "unityassetstore"
                productId = ""
                description = ""
                shortDescription = ""
                thumbnail = ""
                publisher = ""
                price = ""
                promoPrice = ""
                rating = ""
                ratingCount = ""
                category = ""
                minUnityVersion = ""
            }
        }

        $assetStoreQueries = @($queries)
        if ($assetStoreQueries.Count -eq 0) {
            $assetStoreQueries = @($displayName)
        }
        if ($assetStoreQueries.Count -gt $AssetStoreQueryLimitPerItem) {
            $assetStoreQueries = @($assetStoreQueries | Select-Object -First $AssetStoreQueryLimitPerItem)
        }

        foreach ($query in $assetStoreQueries) {
            $assetStoreCandidates = Search-UnityAssetStore -Query $query -MaxResults $MaxResultsPerQuery
            foreach ($candidate in $assetStoreCandidates) {
                $score = Score-Candidate -Candidate $candidate -CoreTokens $coreTokens -HintTokens $hintTokens -RequiredNumbers $requiredNumbers
                $row = [pscustomobject]@{
                    title = $candidate.title
                    url   = $candidate.url
                    query = $candidate.query
                    score = $score
                    source = "unityassetstore"
                    productId = $candidate.productId
                    description = $candidate.description
                    shortDescription = $candidate.shortDescription
                    thumbnail = $candidate.thumbnail
                    publisher = $candidate.publisher
                    price = $candidate.price
                    promoPrice = $candidate.promoPrice
                    rating = $candidate.rating
                    ratingCount = $candidate.ratingCount
                    category = $candidate.category
                    minUnityVersion = $candidate.minUnityVersion
                }

                if ($assetStoreCandidateByUrl.ContainsKey($candidate.url)) {
                    $existing = $assetStoreCandidateByUrl[$candidate.url]
                    if ($row.score -gt $existing.score) {
                        $assetStoreCandidateByUrl[$candidate.url] = $row
                        $existing = $assetStoreCandidateByUrl[$candidate.url]
                    }

                    if ([string]::IsNullOrWhiteSpace($existing.description) -and -not [string]::IsNullOrWhiteSpace($row.description)) {
                        $existing.description = $row.description
                    }
                    if ([string]::IsNullOrWhiteSpace($existing.shortDescription) -and -not [string]::IsNullOrWhiteSpace($row.shortDescription)) {
                        $existing.shortDescription = $row.shortDescription
                    }
                    if ([string]::IsNullOrWhiteSpace($existing.thumbnail) -and -not [string]::IsNullOrWhiteSpace($row.thumbnail)) {
                        $existing.thumbnail = $row.thumbnail
                    }
                    if ([string]::IsNullOrWhiteSpace($existing.publisher) -and -not [string]::IsNullOrWhiteSpace($row.publisher)) {
                        $existing.publisher = $row.publisher
                    }
                    if ([string]::IsNullOrWhiteSpace($existing.price) -and -not [string]::IsNullOrWhiteSpace($row.price)) {
                        $existing.price = $row.price
                    }
                    if ([string]::IsNullOrWhiteSpace($existing.promoPrice) -and -not [string]::IsNullOrWhiteSpace($row.promoPrice)) {
                        $existing.promoPrice = $row.promoPrice
                    }
                    if ([string]::IsNullOrWhiteSpace($existing.rating) -and -not [string]::IsNullOrWhiteSpace($row.rating)) {
                        $existing.rating = $row.rating
                    }
                    if ([string]::IsNullOrWhiteSpace($existing.ratingCount) -and -not [string]::IsNullOrWhiteSpace($row.ratingCount)) {
                        $existing.ratingCount = $row.ratingCount
                    }
                    if ([string]::IsNullOrWhiteSpace($existing.category) -and -not [string]::IsNullOrWhiteSpace($row.category)) {
                        $existing.category = $row.category
                    }
                    if ([string]::IsNullOrWhiteSpace($existing.minUnityVersion) -and -not [string]::IsNullOrWhiteSpace($row.minUnityVersion)) {
                        $existing.minUnityVersion = $row.minUnityVersion
                    }
                    if ([string]::IsNullOrWhiteSpace($existing.productId) -and -not [string]::IsNullOrWhiteSpace($row.productId)) {
                        $existing.productId = $row.productId
                    }
                }
                else {
                    $assetStoreCandidateByUrl[$candidate.url] = $row
                }
            }
        }

        $rankedUnity = @($unityCandidateByUrl.Values | Sort-Object -Property @{ Expression = "score"; Descending = $true }, @{ Expression = "title"; Descending = $false })
        $bestUnity = $rankedUnity | Select-Object -First 1

        $rankedAssetStore = @($assetStoreCandidateByUrl.Values | Sort-Object -Property @{ Expression = "score"; Descending = $true }, @{ Expression = "title"; Descending = $false })
        $bestAssetStore = $rankedAssetStore | Select-Object -First 1

        $unitySearchFallback = Build-UnityCollectionSearchUrl -Query $displayName
        $assetStoreSearchFallback = Build-UnityAssetStoreSearchUrl -Query $displayName
        $hasUnityArticle = $null -ne $bestUnity
        $hasAssetStoreArticle = $null -ne $bestAssetStore

        $assetDecisionScore = if ($hasAssetStoreArticle) { $bestAssetStore.score + 6 } else { -10000 }
        $unityDecisionScore = if ($hasUnityArticle) { $bestUnity.score } else { -10000 }
        $preferAssetStore = $assetDecisionScore -ge $unityDecisionScore
        if ($hasAssetStoreArticle -and $hasUnityArticle -and $bestAssetStore.score -lt 22) {
            $preferAssetStore = $false
        }

        $selectedBest = $null
        if ($preferAssetStore -and $hasAssetStoreArticle) {
            $selectedBest = $bestAssetStore
        }
        elseif ($hasUnityArticle) {
            $selectedBest = $bestUnity
        }
        elseif ($hasAssetStoreArticle) {
            $selectedBest = $bestAssetStore
        }

        $bestUrl = if ($null -ne $selectedBest) { $selectedBest.url } else { $assetStoreSearchFallback }
        $bestTitle = if ($null -ne $selectedBest) { $selectedBest.title } else { "Unity Asset Store search: $displayName" }
        $queryUsed = if ($null -ne $selectedBest) { $selectedBest.query } else { $displayName }
        $score = if ($null -ne $selectedBest) { $selectedBest.score } else { 0 }
        $bestLinkSource = if ($null -ne $selectedBest) { $selectedBest.source } else { "unityassetstore_search" }
        $confidence = Get-ConfidenceFromScore -HasMatch ($null -ne $selectedBest) -Score $score

        $previewUrl = if ($hasUnityArticle) { $bestUnity.url } else { $unitySearchFallback }
        $previewTitle = if ($hasUnityArticle) { $bestUnity.title } else { "Search results for $displayName" }

        $assetStoreBestUrl = if ($hasAssetStoreArticle) { $bestAssetStore.url } else { $assetStoreSearchFallback }
        $assetStoreBestTitle = if ($hasAssetStoreArticle) { $bestAssetStore.title } else { "Unity Asset Store search: $displayName" }
        $assetStoreScore = if ($hasAssetStoreArticle) { $bestAssetStore.score } else { 0 }
        $assetStoreConfidence = Get-ConfidenceFromScore -HasMatch $hasAssetStoreArticle -Score $assetStoreScore

        $sourceType = "archive"
        if ($folderCount -gt 0 -and $archiveCount -gt 0) {
            $sourceType = "mixed"
        }
        elseif ($folderCount -gt 0) {
            $sourceType = "folder"
        }

        $packageRows.Add([pscustomobject]@{
                name               = $rawName
                displayName        = $displayName
                sourceType         = $sourceType
                sourceCount        = $sources.Count
                sourceNames        = @($allBaseNames)
                sourcePaths        = @($sources | Select-Object -ExpandProperty fullPath -Unique)
                archiveExtensions  = @($sources | Where-Object { $_.sourceType -eq "archive" } | Select-Object -ExpandProperty extension -Unique)
                primaryPath        = $primarySource.fullPath
                folderPath         = if ($null -ne $folderSource) { $folderSource.fullPath } else { $null }
                originalPackageUrl = $originalPackageUrl
                bestArticleTitle   = $bestTitle
                bestArticleUrl     = $bestUrl
                previewArticleTitle = $previewTitle
                previewArticleUrl  = $previewUrl
                bestLinkSource     = $bestLinkSource
                unitySearchUrl     = $unitySearchFallback
                assetStoreSearchUrl = $assetStoreSearchFallback
                assetStoreBestTitle = $assetStoreBestTitle
                assetStoreBestUrl   = $assetStoreBestUrl
                assetStoreScore     = $assetStoreScore
                assetStoreConfidence = $assetStoreConfidence
                assetStoreProductId = if ($hasAssetStoreArticle) { $bestAssetStore.productId } else { "" }
                assetStorePublisher = if ($hasAssetStoreArticle) { $bestAssetStore.publisher } else { "" }
                assetStorePrice     = if ($hasAssetStoreArticle) { $bestAssetStore.price } else { "" }
                assetStorePromoPrice = if ($hasAssetStoreArticle) { $bestAssetStore.promoPrice } else { "" }
                assetStoreRating    = if ($hasAssetStoreArticle) { $bestAssetStore.rating } else { "" }
                assetStoreRatingCount = if ($hasAssetStoreArticle) { $bestAssetStore.ratingCount } else { "" }
                assetStoreCategory  = if ($hasAssetStoreArticle) { $bestAssetStore.category } else { "" }
                assetStoreMinUnityVersion = if ($hasAssetStoreArticle) { $bestAssetStore.minUnityVersion } else { "" }
                assetStoreThumbnail = if ($hasAssetStoreArticle) { $bestAssetStore.thumbnail } else { "" }
                assetStoreShortDescription = if ($hasAssetStoreArticle) { $bestAssetStore.shortDescription } else { "" }
                assetStoreDescription = if ($hasAssetStoreArticle) { $bestAssetStore.description } else { "" }
                queryUsed          = $queryUsed
                score              = $score
                confidence         = $confidence
                fallbackSearchUrl  = $assetStoreSearchFallback
                topCandidates      = if ($bestLinkSource -eq "unityassetcollection") { @($rankedUnity | Select-Object -First 3) } else { @($rankedAssetStore | Select-Object -First 3) }
                topUnityCandidates = @($rankedUnity | Select-Object -First 3)
                topAssetStoreCandidates = @($rankedAssetStore | Select-Object -First 3)
            })
    }

    $folderEntries = @($allSources | Where-Object { $_.sourceType -eq "folder" }).Count
    $archiveEntries = @($allSources | Where-Object { $_.sourceType -eq "archive" }).Count

    return [pscustomobject]@{
        id             = $LibraryId
        label          = $Label
        root           = $RootPath
        totalPackages  = $packageRows.Count
        totalEntries   = $allSources.Count
        totalFolders   = $folderEntries
        totalArchives  = $archiveEntries
        packages       = @($packageRows | Sort-Object -Property name)
        status         = "ok"
    }
}

if ([string]::IsNullOrWhiteSpace($OutputPath)) {
    $OutputPath = Join-Path $PSScriptRoot "..\data\packages.json"
}

$resolvedOutputPath = Resolve-OutputPath -Path $OutputPath
$resolvedPackageRoot = Resolve-OutputPath -Path $PackageRoot
$resolvedPluginRoot = Resolve-OutputPath -Path $PluginRoot

$archiveExtensionSet = New-ArchiveExtensionSet -Extensions $ArchiveExtensions

$packageLibrary = Build-LibraryData -LibraryId "package" -Label "Unity Package" -RootPath $resolvedPackageRoot -ExcludeNames $Exclude -ArchiveExtensionSet $archiveExtensionSet -MaxResultsPerQuery $MaxResultsPerQuery -QueryLimitPerItem $QueryLimitPerItem -AssetStoreQueryLimitPerItem $AssetStoreQueryLimitPerItem
$pluginLibrary = Build-LibraryData -LibraryId "plugin" -Label "Unity Plugin" -RootPath $resolvedPluginRoot -ExcludeNames $Exclude -ArchiveExtensionSet $archiveExtensionSet -MaxResultsPerQuery $MaxResultsPerQuery -QueryLimitPerItem $QueryLimitPerItem -AssetStoreQueryLimitPerItem $AssetStoreQueryLimitPerItem

$libraries = @($packageLibrary, $pluginLibrary)
$totalPackages = ($libraries | Measure-Object -Property totalPackages -Sum).Sum

$data = [pscustomobject]@{
    generatedAt       = [DateTime]::UtcNow.ToString("yyyy-MM-ddTHH:mm:ssZ")
    defaultLibraryId  = "package"
    totalPackages     = $totalPackages
    libraryCount      = $libraries.Count
    libraries         = $libraries
    assetsRoot        = $resolvedPackageRoot
    packages          = $packageLibrary.packages
}

$outputDirectory = Split-Path -Parent $resolvedOutputPath
if (-not (Test-Path -LiteralPath $outputDirectory)) {
    New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
}

$json = $data | ConvertTo-Json -Depth 10
[System.IO.File]::WriteAllText($resolvedOutputPath, $json, [System.Text.UTF8Encoding]::new($false))

$jsOutputPath = [System.IO.Path]::ChangeExtension($resolvedOutputPath, ".js")
$jsContent = "window.PACKAGE_DATA = $json;`r`n"
[System.IO.File]::WriteAllText($jsOutputPath, $jsContent, [System.Text.UTF8Encoding]::new($false))

Write-Host ""
Write-Host "Generated: $resolvedOutputPath"
Write-Host "Generated: $jsOutputPath"
Write-Host "Libraries: $($libraries.Count)"
Write-Host "Total packages: $totalPackages"
foreach ($library in $libraries) {
    Write-Host "- $($library.label): $($library.totalPackages) package(s), $($library.totalEntries) source item(s)"
}
