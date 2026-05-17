export type SourceItem = {
  name: string;
  organization: string;
  url: string;
  yearRange: string;
  scope: string;
};

export type SourceGroup = {
  title: string;
  note: string;
  items: SourceItem[];
};

export const SOURCE_GROUPS: SourceGroup[] = [
  {
    title: "Core Climate Model Inputs",
    note:
      "These datasets drive the baseline temperature model and the user-controlled scenario levers.",
    items: [
      {
        name: "Global Surface Temperature Anomalies",
        organization: "NASA GISS",
        url: "https://data.giss.nasa.gov/gistemp/data_v4.html",
        yearRange: "1880-2026",
        scope: "Global",
      },
      {
        name: "CO2 and Greenhouse Gas Emissions",
        organization: "Our World in Data / OWID CO2 Data",
        url: "https://github.com/owid/co2-data",
        yearRange: "1750-2024",
        scope: "Global",
      },
      {
        name: "Energy and Renewables Share",
        organization: "Our World in Data / Ember",
        url: "https://ourworldindata.org/energy",
        yearRange: "1900-2024",
        scope: "Global",
      },
      {
        name: "Deforestation Dataset",
        organization: "Kaggle / SDG Analysis 2022",
        url: "https://www.kaggle.com/datasets/konradb/deforestation-dataset?resource=download",
        yearRange: "2000-2020",
        scope: "Global",
      },
    ],
  },
  {
    title: "Heat & Health",
    note:
      "These datasets are used to estimate heat mortality, heat-related work-loss pressure, and related global heat-health indicators.",
    items: [
      {
        name: "CMIP Atlas Warming Levels",
        organization: "IPCC WG1 Atlas",
        url: "https://github.com/IPCC-WG1/Atlas/blob/devel/warming-levels/CMIP5_Atlas_WarmingLevels.csv",
        yearRange: "Atlas warming-level reference",
        scope: "Global",
      },
      {
        name: "Outdoor Workers Dataset",
        organization: "Lancet Countdown",
        url: "https://lancetcountdown.org/explore-our-data/",
        yearRange: "2000-2024",
        scope: "Global",
      },
      {
        name: "PWHL Heat Work-Loss Dataset",
        organization: "Lancet Countdown",
        url: "https://lancetcountdown.org/explore-our-data/",
        yearRange: "1990-2024",
        scope: "Global",
      },
      {
        name: "Heat-Related Mortality Dataset",
        organization: "Lancet Countdown",
        url: "https://lancetcountdown.org/explore-our-data/",
        yearRange: "1990-2021",
        scope: "Global",
      },
    ],
  },
  {
    title: "Flooding & Coasts",
    note:
      "The coastal card combines a localized future sea-level projection with historical sea-level, Antarctic ice-mass, and Philippines flood-exposure reference datasets.",
    items: [
      {
        name: "IPCC AR6 Local Sea-Level Projection",
        organization: "IPCC AR6 / NASA Sea Level Projection Tool",
        url: "https://sealevel.nasa.gov/ipcc-ar6-sea-level-projection-tool",
        yearRange: "2020-2150",
        scope: "Philippines-specific",
      },
      {
        name: "Global Mean Sea Level",
        organization: "Our World in Data / Climate Change Explorer",
        url: "https://ourworldindata.org/explorers/climate-change?facet=none&country=OWID_WRL~ATA~Gulkana+Glacier~Lemon+Creek+Glacier~OWID_NAM~South+Cascade+Glacier~Wolverine+Glacier&overlay=download-data&Metric=Sea+level+rise&Long-run+series=false",
        yearRange: "1880s-recent source range",
        scope: "Global",
      },
      {
        name: "Ice Sheet Mass Balance",
        organization: "Our World in Data / NASA",
        url: "https://ourworldindata.org/grapher/ice-sheet-mass-balance.csv",
        yearRange: "1990s-recent source range",
        scope: "Global / Antarctica",
      },
      {
        name: "Global Flood Database Population Sensitivity",
        organization: "HydroShare / Global Flood Database",
        url: "https://www.hydroshare.org/resource/6461528501c14f7c9d6b10d20dd4f657/",
        yearRange: "Static reference snapshot",
        scope: "Philippines-specific",
      },
      {
        name: "Global Flood Database Flood Mechanism",
        organization: "HydroShare / Global Flood Database",
        url: "https://www.hydroshare.org/resource/6461528501c14f7c9d6b10d20dd4f657/",
        yearRange: "Static reference snapshot",
        scope: "Philippines-specific",
      },
    ],
  },
  {
    title: "Food & Agriculture",
    note:
      "These datasets support the food-system pressure card, including undernourishment, food-price pressure, and agricultural water stress.",
    items: [
      {
        name: "Prevalence of Undernourishment",
        organization: "Our World in Data / FAO",
        url: "https://ourworldindata.org/hunger-and-undernourishment",
        yearRange: "2000-2024",
        scope: "Global",
      },
      {
        name: "FAO Food Price Index",
        organization: "FAO",
        url: "https://www.fao.org/worldfoodsituation/foodpricesindex/en/",
        yearRange: "1990-2026",
        scope: "Global",
      },
      {
        name: "FAOSTAT Crops and Livestock Products",
        organization: "FAO",
        url: "https://www.fao.org/faostat/en/#data/QCL",
        yearRange: "FAOSTAT source range",
        scope: "Global",
      },
      {
        name: "AQUASTAT Agricultural Water Stress",
        organization: "FAO AQUASTAT",
        url: "https://www.fao.org/aquastat/en/",
        yearRange: "2000-2022",
        scope: "Global",
      },
    ],
  },
  {
    title: "Ecosystems",
    note:
      "The ecosystem card mixes global biodiversity and ocean indicators with Philippines-specific coral thermal-stress data.",
    items: [
      {
        name: "Red List Index",
        organization: "Our World in Data / IUCN",
        url: "https://ourworldindata.org/grapher/red-list-index",
        yearRange: "1993-2024",
        scope: "Global",
      },
      {
        name: "Seawater pH",
        organization: "Our World in Data / NOAA",
        url: "https://ourworldindata.org/grapher/seawater-ph",
        yearRange: "1988-2024",
        scope: "Global",
      },
      {
        name: "Tree Cover Loss",
        organization: "Our World in Data / Global Forest Watch",
        url: "https://ourworldindata.org/deforestation",
        yearRange: "2001-2024",
        scope: "Global",
      },
      {
        name: "Burned Area",
        organization: "JRC Global Wildfire Information System",
        url: "https://gwis.jrc.ec.europa.eu/apps/country.profile/downloads",
        yearRange: "2002-2024",
        scope: "Global",
      },
      {
        name: "Fish Capture Quantity",
        organization: "FAO",
        url: "https://www.fao.org/fishery/en/statistics/software/fishstatj",
        yearRange: "1950-present source range",
        scope: "Global",
      },
      {
        name: "Coral Reef Watch Thermal Stress Stations",
        organization: "NOAA Coral Reef Watch",
        url: "https://coralreefwatch.noaa.gov/product/vs/data.php",
        yearRange: "1985-2024",
        scope: "Philippines-specific",
      },
    ],
  },
];

export function DataSourcesSection() {
  return (
    <section className="support-card sources-section">
      <p className="eyebrow">Data Sources</p>
      <h3>Datasets used across the prediction workflow</h3>
      <p className="sources-intro">
        These are the source datasets used to train, drive, or localize the projections shown on
        this page. Climate-core inputs, impact models, and localized coastal projections do not all
        come from the same provider, so the sources are grouped by prediction area.
      </p>

      <div className="sources-groups">
        {SOURCE_GROUPS.map((group) => (
          <article key={group.title} className="source-group-card">
            <div className="source-group-header">
              <h4>{group.title}</h4>
              <p>{group.note}</p>
            </div>

            <div className="source-items">
              {group.items.map((item) => (
                <article key={`${group.title}-${item.name}`} className="source-item-card">
                  <div className="source-item-top">
                    <h5>{item.name}</h5>
                    <a href={item.url} target="_blank" rel="noreferrer">
                      Open source
                    </a>
                  </div>
                  <div className="source-meta-grid">
                    <div>
                      <span>Organization</span>
                      <strong>{item.organization}</strong>
                    </div>
                    <div>
                      <span>Year range</span>
                      <strong>{item.yearRange}</strong>
                    </div>
                    <div>
                      <span>Scope</span>
                      <strong>{item.scope}</strong>
                    </div>
                    <div>
                      <span>URL</span>
                      <strong className="source-url">{item.url}</strong>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
