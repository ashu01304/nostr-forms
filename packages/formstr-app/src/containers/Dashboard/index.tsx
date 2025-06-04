import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { FormDetails } from "../CreateFormNew/components/FormDetails";
import { Event, SubCloser } from "nostr-tools";
import { useProfileContext } from "../../hooks/useProfileContext";
import { getDefaultRelays } from "@formstr/sdk";
import { FormEventCard } from "./FormCards/FormEventCard";
import DashboardStyleWrapper from "./index.style";
import EmptyScreen from "../../components/EmptyScreen";
import { useApplicationContext } from "../../hooks/useApplicationContext";
import { getItem, LOCAL_STORAGE_KEYS } from "../../utils/localStorage";
import { ILocalForm } from "../CreateFormNew/providers/FormBuilder/typeDefs";
import { Dropdown, Menu, Typography, Button } from "antd";
import { DownOutlined, SettingOutlined } from "@ant-design/icons";
import { MyForms } from "./FormCards/MyForms";
import AISettingsModal from "../../components/AISettings";
import { Drafts } from "./FormCards/Drafts";
import { LocalForms } from "./FormCards/LocalForms";
import { useNavigate } from "react-router-dom"; 
import { availableTemplates, FormTemplate} from "../../templates";
import { ROUTES } from "../../constants/routes";
import { FormInitData } from "../CreateFormNew/providers/FormBuilder/typeDefs";
import { createFormSpecFromTemplate } from "../../utils/formUtils";

const MENU_OPTIONS = {
  local: "On this device",
  shared: "Shared with me",
  myForms: "My forms",
  drafts: "Drafts",
};

type FilterType = "local" | "shared" | "myForms" | "drafts";

type RouteMapType = {
  [key: string]: FilterType;
};

const ROUTE_TO_FILTER_MAP: RouteMapType = {
  [ROUTES.DASHBOARD_LOCAL]: "local",
  [ROUTES.DASHBOARD_SHARED]: "shared",
  [ROUTES.DASHBOARD_MY_FORMS]: "myForms",
  [ROUTES.DASHBOARD_DRAFTS]: "drafts",
  [ROUTES.DASHBOARD]: "local",
};

const defaultRelays = getDefaultRelays();

export const Dashboard = () => {
  const { state } = useLocation();
  const location = useLocation();
  const { pubkey } = useProfileContext();
  const [showFormDetails, setShowFormDetails] = useState<boolean>(!!state);
  const [localForms, setLocalForms] = useState<ILocalForm[]>(
    getItem(LOCAL_STORAGE_KEYS.LOCAL_FORMS) || []
  );
  const [nostrForms, setNostrForms] = useState<Map<string, Event>>(new Map());
  
  const getCurrentFilterFromPath = (): FilterType => {
    const path = location.pathname;
    return ROUTE_TO_FILTER_MAP[path] || "local";
  };
  
  const [filter, setFilter] = useState<FilterType>(getCurrentFilterFromPath());
  const [isAISettingsModalVisible, setIsAISettingsModalVisible] = useState(false);

  const { poolRef } = useApplicationContext();

  const subCloserRef = useRef<SubCloser | null>(null);


  useEffect(() => {
    const currentFilter = getCurrentFilterFromPath();
    setFilter(currentFilter);
  }, [location.pathname]);

  const handleEvent = (event: Event) => {
    setNostrForms((prevMap) => {
      const newMap = new Map(prevMap);
      newMap.set(event.id, event);
      return newMap;
    });
  };

  const fetchNostrForms = () => {
    if (!pubkey) return;
    const queryFilter = {
      kinds: [30168],
      "#p": [pubkey],
    };

    subCloserRef.current = poolRef.current.subscribeMany(
      defaultRelays,
      [queryFilter],
      {
        onevent: handleEvent,
        onclose() {
          subCloserRef.current?.close();
        },
      }
    );
  };

  useEffect(() => {
    if (pubkey && nostrForms.size === 0) {
      fetchNostrForms();
    }
    return () => {
      if (subCloserRef.current) {
        subCloserRef.current.close();
      }
    };
  }, [pubkey]);

  const navigate = useNavigate();

  const handleTemplateClick = (template: FormTemplate) => {
    const { spec, id } = createFormSpecFromTemplate(template);
    const navigationState: FormInitData = { spec, id };
    navigate(ROUTES.CREATE_FORMS_NEW, { state: navigationState });
  };

  const renderForms = () => {
    if (filter === "local") {
      if (localForms.length == 0){ 
        return (
          <EmptyScreen
            templates={availableTemplates}
            onTemplateClick={handleTemplateClick}
            message="No forms found on this device. Start by choosing a template:"
            action={() => navigate(ROUTES.CREATE_FORMS_NEW)}
            actionLabel="Create New Form"
          />
        );
      }
      return (
        <LocalForms
          localForms={localForms}
          onDeleted={(localForm: ILocalForm) =>
            setLocalForms(localForms.filter((f) => f.key !== localForm.key))
          }
        />
      );
    } else if (filter === "shared") {
      if (nostrForms.size == 0){
        return <EmptyScreen message="No forms shared with you." />;
      }
      return Array.from(nostrForms.values()).map((formEvent: Event) => {
        let d_tag = formEvent.tags.find((t) => t[0] === "d")?.[1];
        if (!d_tag) return null; 
        let key = `${formEvent.kind}:${formEvent.pubkey}:${d_tag}`;
        return <FormEventCard key={key} event={formEvent} />;
      });
    } else if (filter === "myForms") {
      return <MyForms />;
    } else if (filter === "drafts") {
      return <Drafts />;
    }
    return null;
  };

  const handleFilterChange = (selectedFilter: FilterType) => {
    const routeMap = {
      local: ROUTES.DASHBOARD_LOCAL,
      shared: ROUTES.DASHBOARD_SHARED,
      myForms: ROUTES.DASHBOARD_MY_FORMS,
      drafts: ROUTES.DASHBOARD_DRAFTS
    };
    
    navigate(routeMap[selectedFilter]);
  };

  const menu = (
    <Menu style={{ textAlign: "center" }}>
      <Menu.Item 
        key="local"
        onClick={() => handleFilterChange("local")}
      >
        {MENU_OPTIONS.local}
      </Menu.Item>
      <Menu.Item
        key="shared"
        onClick={() => handleFilterChange("shared")}
        disabled={!pubkey}
      >
        {MENU_OPTIONS.shared}
      </Menu.Item>
      <Menu.Item
        key="myForms"
        onClick={() => handleFilterChange("myForms")}
        disabled={!pubkey}
      >
        {MENU_OPTIONS.myForms}
      </Menu.Item>
      <Menu.Item 
        key="drafts"
        onClick={() => handleFilterChange("drafts")}
      >
        {MENU_OPTIONS.drafts}
      </Menu.Item>
    </Menu>
  };

  const showAISettingsModal = () => {
    setIsAISettingsModalVisible(true);
  };

  const handleAISettingsModalClose = () => {
    setIsAISettingsModalVisible(false);
  );

  return (
    <DashboardStyleWrapper>
      <div className="dashboard-container">
        <div className="dashboard-header">
          <div className="filter-dropdown-container">
            <Dropdown overlay={menu} trigger={["click"]} placement="bottomLeft" overlayClassName="dashboard-filter-menu">
              <Button>
                {MENU_OPTIONS[filter]}
                <DownOutlined style={{ marginLeft: "8px", fontSize: "12px" }} />
              </Button>
            </Dropdown>
          </div>
          <div className="dashboard-actions">
            <Button icon={<SettingOutlined />} onClick={showAISettingsModal}>
              AI Settings
            </Button>
          </div>
        </div>
        <div className="form-cards-container">{renderForms()}</div>
        <AISettingsModal
          visible={isAISettingsModalVisible}
          onClose={handleAISettingsModalClose}
        />
        <>
          {state && (
            <FormDetails
              isOpen={showFormDetails}
              {...state}
              onClose={() => {
                setShowFormDetails(false);
                setLocalForms(getItem(LOCAL_STORAGE_KEYS.LOCAL_FORMS) || []);
              }}
            />
          )}
        </>
      </div>
    </DashboardStyleWrapper>
  );
};